import { checkAIToolPermission, listAIPermissionRules } from '../permissions';
import { createUnifiedDiff } from '../unifiedDiff';
import type { AIRuntimeEvent } from '../types';
import type { AIToolCallExecutionResult, AIToolCallRequest, AIToolContext } from './types';
import type { AIToolRegistry } from './registry';

export interface ExecuteAIToolOptions {
  registry: AIToolRegistry;
  call: AIToolCallRequest;
  context?: AIToolContext;
  emit?: (event: AIRuntimeEvent) => void;
}

const stringifyError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return '工具执行失败。';
  }
};

const hasRecognizableChangePlan = (text?: string): boolean => {
  if (!text) return false;
  const normalized = text.toLowerCase();
  const hasPlanMarker = /修改计划|change plan|plan|要改|将修改/.test(normalized);
  const hasFileMarker = /文件|file|path|\.ts|\.tsx|\.js|\.vue|\.json|\.md/.test(normalized);
  const hasReasonMarker = /原因|why|because|为了|修复|避免|验证|test|check/.test(normalized);
  return hasPlanMarker && hasFileMarker && hasReasonMarker;
};

const extractWriteTargetPaths = (toolName: string, input: unknown): string[] => {
  if (!input || typeof input !== 'object') return [];
  const record = input as Record<string, unknown>;
  if (toolName === 'write-file' && typeof record.path === 'string') return [record.path];
  if (toolName === 'apply-patch' && typeof record.patch === 'string') {
    return Array.from(record.patch.matchAll(/(?:^|\n)(?:\+\+\+|---)\s+(?:a\/|b\/)?([^\n\t]+)/g))
      .map((match) => match[1].trim())
      .filter((path) => path && path !== '/dev/null');
  }
  return [];
};

const isPathAllowedByPlan = (targetPath: string, planFiles: string[]): boolean => planFiles.some((planPath) => {
  const normalizedTarget = targetPath.replace(/^a\//, '').replace(/^b\//, '');
  const normalizedPlan = planPath.replace(/^a\//, '').replace(/^b\//, '');
  return normalizedTarget === normalizedPlan || normalizedTarget.endsWith(`/${normalizedPlan}`) || normalizedPlan.endsWith(`/${normalizedTarget}`);
});

const pickVerificationCommand = (verification: string[]): string | undefined => {
  const joined = verification.join('\n');
  const commandMatch = joined.match(/(?:`([^`]+)`|(?:运行|run|execute)[:：]?\s*([^\n]+))/i);
  const command = commandMatch?.[1] || commandMatch?.[2];
  if (command?.trim()) return command.trim();
  if (/build/i.test(joined)) return 'npm run build';
  if (/test|测试/i.test(joined)) return 'npm test';
  if (/lint/i.test(joined)) return 'npm run lint';
  return undefined;
};

const createWritePreview = async (params: {
  toolName: string;
  input: unknown;
  targetPaths: string[];
  registry: ExecuteAIToolOptions['registry'];
  context: AIToolContext;
}) => {
  const record = params.input && typeof params.input === 'object' ? params.input as Record<string, unknown> : {};
  let rawPreview = params.toolName === 'apply-patch'
    ? String(record.patch ?? '')
    : `# write-file ${params.targetPaths[0] ?? ''}\n${String(record.content ?? '')}`;

  if (params.toolName === 'write-file' && typeof record.content === 'string' && params.targetPaths[0]) {
    const readTool = params.registry.get('read-file');
    if (readTool) {
      const validation = readTool.validate({ path: params.targetPaths[0], maxChars: 20000 });
      if (validation.ok && validation.input !== undefined) {
        try {
          const readOutput = await readTool.call(validation.input, params.context, () => undefined);
          const oldContent = typeof readOutput === 'string'
            ? readOutput
            : readOutput && typeof readOutput === 'object' && typeof (readOutput as Record<string, unknown>).content === 'string'
              ? String((readOutput as Record<string, unknown>).content)
              : undefined;
          if (oldContent !== undefined) {
            rawPreview = createUnifiedDiff({
              filePath: params.targetPaths[0],
              oldContent,
              newContent: record.content,
            });
          }
        } catch {
          rawPreview = `# write-file ${params.targetPaths[0]}\n${record.content}`;
        }
      }
    }
  }

  return {
    toolName: params.toolName,
    targetPaths: params.targetPaths,
    preview: rawPreview.length > 12000 ? `${rawPreview.slice(0, 12000)}\n[preview truncated]` : rawPreview,
  };
};

export const executeAITool = async ({ registry, call, context = {}, emit }: ExecuteAIToolOptions): Promise<AIToolCallExecutionResult> => {
  const tool = registry.get(call.name);
  emit?.({ type: 'tool_call_start', call });

  if (!tool) {
    const error = `未知工具：${call.name}`;
    const result = { callId: call.id, name: call.name, output: null, error };
    emit?.({ type: 'tool_call_result', result });
    return result;
  }

  try {
    const validation = tool.validate(call.input);
    if (!validation.ok || validation.input === undefined) {
      const error = validation.message || `工具 ${tool.name} 参数无效。`;
      const result = { callId: call.id, name: tool.name, output: null, error };
      emit?.({ type: 'tool_call_result', result });
      return result;
    }

    if (
      context.writePlanGuard?.required
      && context.writePlanGuard.blockingTools.includes(tool.name)
      && !context.writePlanGuard.activePlan
      && !hasRecognizableChangePlan(context.writePlanGuard.assistantPlanText)
    ) {
      const error = `写入已被 Code Change Plan Guard 拦截：调用 ${tool.name} 前必须先给出结构化修改计划（包含文件、原因和验证说明）。`;
      const result = { callId: call.id, name: tool.name, output: null, error };
      emit?.({ type: 'tool_call_result', result });
      return result;
    }

    if (
      context.writePlanGuard?.required
      && context.writePlanGuard.blockingTools.includes(tool.name)
      && context.writePlanGuard.activePlan
    ) {
      const targetPaths = extractWriteTargetPaths(tool.name, validation.input);
      if (!targetPaths.length) {
        const error = `写入已被 Plan File Scope Guard 拦截：无法识别 ${tool.name} 的目标文件。`;
        const result = { callId: call.id, name: tool.name, output: null, error };
        emit?.({ type: 'tool_call_result', result });
        return result;
      }
      const outOfScopePath = targetPaths.find((targetPath) => !isPathAllowedByPlan(targetPath, context.writePlanGuard?.activePlan?.files ?? []));
      if (outOfScopePath) {
        const error = `写入已被 Plan File Scope Guard 拦截：${tool.name} 目标文件 ${outOfScopePath} 不在修改计划范围内。`;
        const result = { callId: call.id, name: tool.name, output: null, error };
        emit?.({ type: 'tool_call_result', result });
        return result;
      }
      if (!context.writePlanGuard.approvedPlanIds?.includes(context.writePlanGuard.activePlan.id)) {
        const decision = context.requestPlanApproval
          ? await context.requestPlanApproval(context.writePlanGuard.activePlan, await createWritePreview({
            toolName: tool.name,
            input: validation.input,
            targetPaths,
            registry,
            context,
          }))
          : 'denied';
        if (decision !== 'approved') {
          const error = `写入已被 Plan Approval Guard 拦截：修改计划 ${context.writePlanGuard.activePlan.id} 未获批准。`;
          const result = { callId: call.id, name: tool.name, output: null, error };
          emit?.({ type: 'tool_call_result', result });
          return result;
        }
      }
    }

    const runtimePermission = await checkAIToolPermission({
      tool,
      input: validation.input,
      context: {
        conversationId: context.conversationId,
        permissionMode: context.permissionMode,
        rules: context.permissionRules ?? listAIPermissionRules(),
      },
    });
    if (runtimePermission.behavior === 'deny') {
      const error = runtimePermission.message || `工具 ${tool.name} 未获得执行权限。`;
      const result = { callId: call.id, name: tool.name, output: null, error };
      emit?.({ type: 'tool_call_result', result });
      return result;
    }
    if (runtimePermission.behavior === 'ask') {
      if (context.metadata?.background) {
        const error = runtimePermission.message || `后台 Agent 不允许交互式权限确认：${tool.name}`;
        const result = { callId: call.id, name: tool.name, output: null, error };
        emit?.({ type: 'tool_call_result', result });
        return result;
      }
      const decision = context.requestPermission
        ? await context.requestPermission({
          conversationId: context.conversationId,
          toolName: tool.name,
          input: validation.input,
          message: runtimePermission.message || `工具 ${tool.name} 请求执行权限。`,
          reason: runtimePermission.reason,
        })
        : 'deny';
      if (decision !== 'allow') {
        const error = runtimePermission.message || `工具 ${tool.name} 未获得执行权限。`;
        const result = { callId: call.id, name: tool.name, output: null, error };
        emit?.({ type: 'tool_call_result', result });
        return result;
      }
    }

    const permission = await tool.checkPermission(validation.input, context);
    if (permission.behavior === 'deny') {
      const error = permission.message || `工具 ${tool.name} 未获得执行权限。`;
      const result = { callId: call.id, name: tool.name, output: null, error };
      emit?.({ type: 'tool_call_result', result });
      return result;
    }
    if (permission.behavior === 'ask') {
      if (context.metadata?.background) {
        const error = permission.message || `后台 Agent 不允许交互式权限确认：${tool.name}`;
        const result = { callId: call.id, name: tool.name, output: null, error };
        emit?.({ type: 'tool_call_result', result });
        return result;
      }
      const decision = context.requestPermission
        ? await context.requestPermission({
          conversationId: context.conversationId,
          toolName: tool.name,
          input: validation.input,
          message: permission.message || `工具 ${tool.name} 请求执行权限。`,
          reason: permission.reason,
        })
        : 'deny';
      if (decision !== 'allow') {
        const error = permission.message || `工具 ${tool.name} 未获得执行权限。`;
        const result = { callId: call.id, name: tool.name, output: null, error };
        emit?.({ type: 'tool_call_result', result });
        return result;
      }
    }

    const output = await tool.call(validation.input, context, (progress) => {
      emit?.({ type: 'tool_call_progress', callId: call.id, message: progress.message });
    });
    const result = { callId: call.id, name: tool.name, output };
    emit?.({ type: 'tool_call_result', result });

    if (
      context.writePlanGuard?.activePlan
      && context.writePlanGuard.blockingTools.includes(tool.name)
    ) {
      const command = pickVerificationCommand(context.writePlanGuard.activePlan.verification);
      const runCheckTool = registry.get('run-check');
      if (command && runCheckTool) {
        const validationResult = runCheckTool.validate({ command });
        if (validationResult.ok && validationResult.input !== undefined) {
          try {
            const verificationOutput = await runCheckTool.call(validationResult.input, context, (progress) => {
              emit?.({ type: 'tool_call_progress', callId: call.id, message: progress.message });
            });
            emit?.({
              type: 'post_write_verification',
              toolName: 'run-check',
              ok: true,
              summary: typeof verificationOutput === 'string' ? verificationOutput : JSON.stringify(verificationOutput),
            });
          } catch (verificationError) {
            emit?.({
              type: 'post_write_verification',
              toolName: 'run-check',
              ok: false,
              summary: stringifyError(verificationError),
            });
          }
        }
      }
    }

    return result;
  } catch (error) {
    const result = { callId: call.id, name: call.name, output: null, error: stringifyError(error) };
    emit?.({ type: 'tool_call_result', result });
    return result;
  }
};
