import type { AIToolPermissionBehavior } from '../tools';
import { appendAIToolAuditLog } from './audit';
import { findPermissionRule } from './rules';
import type {
  AIPermissionCheckInput,
  AIPermissionDecision,
  AIPermissionRequest,
  AIPermissionResourceKind,
  AIPermissionSuggestion,
} from './types';

const previewInput = (input: unknown): string => {
  try {
    const text = JSON.stringify(input, null, 2);
    return text.length > 800 ? `${text.slice(0, 800)}...` : text;
  } catch {
    return String(input);
  }
};

const getStringField = (input: unknown, key: string): string => {
  if (!input || typeof input !== 'object') return '';
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
};

const inferResource = (
  toolName: string,
  input: unknown,
): { resourceKind: AIPermissionResourceKind; resource: string } => {
  if (toolName.startsWith('mcp__')) {
    return { resourceKind: 'mcp', resource: toolName };
  }

  if (toolName === 'web-fetch') {
    const url = getStringField(input, 'url');
    try {
      return { resourceKind: 'domain', resource: new URL(url).host };
    } catch {
      return { resourceKind: 'domain', resource: url || '*' };
    }
  }

  if (toolName === 'save-document') {
    return { resourceKind: 'path', resource: getStringField(input, 'directory') || 'Documents/workgaga/AI-文档' };
  }

  if (toolName === 'list-files' || toolName === 'search-files') {
    return { resourceKind: 'path', resource: getStringField(input, 'directory') || '*' };
  }

  if (toolName === 'read-file' || toolName === 'write-file') {
    return { resourceKind: 'path', resource: getStringField(input, 'path') || '*' };
  }

  if (toolName === 'run-check') {
    return { resourceKind: 'command', resource: getStringField(input, 'command') || '*' };
  }

  if (
    toolName === 'create-todo' ||
    toolName === 'create-schedule' ||
    toolName === 'refresh-knowledge-index' ||
    toolName === 'apply-patch'
  ) {
    return { resourceKind: 'action', resource: toolName };
  }

  return { resourceKind: 'tool', resource: toolName };
};

const allowModes = (
  permissionMode: string | undefined,
  behavior: AIToolPermissionBehavior,
  readOnly: boolean,
): boolean => {
  if (behavior === 'allow') return true;
  if (permissionMode === 'bypass') return true;
  if (permissionMode === 'auto-read' && readOnly) return true;
  if (permissionMode === 'auto-write') return true;
  return false;
};

const buildSuggestions = (
  toolName: string,
  resourceKind: AIPermissionResourceKind,
  resource: string,
): AIPermissionSuggestion[] => [
  {
    label: '始终允许此资源',
    rule: { behavior: 'allow', resourceKind, pattern: resource, toolName, reason: '用户允许' },
  },
  {
    label: '始终拒绝此资源',
    rule: { behavior: 'deny', resourceKind, pattern: resource, toolName, reason: '用户拒绝' },
  },
];

export const checkAIToolPermission = async ({
  tool,
  input,
  context = {},
}: AIPermissionCheckInput): Promise<AIPermissionDecision> => {
  const { resourceKind, resource } = inferResource(tool.name, input);
  const rule =
    findPermissionRule(context.rules, resourceKind, resource, tool.name) ??
    findPermissionRule(context.rules, 'tool', tool.name, tool.name);

  if (rule) {
    appendAIToolAuditLog({
      toolName: tool.name,
      behavior: rule.behavior,
      resourceKind,
      resource,
      reason: rule.reason || `匹配权限规则：${rule.pattern}`,
      conversationId: context.conversationId,
    });
    return { behavior: rule.behavior, reason: rule.reason || `匹配权限规则：${rule.pattern}` };
  }

  if (context.permissionMode === 'auto-read' && !tool.readOnly) {
    appendAIToolAuditLog({
      toolName: tool.name,
      behavior: 'deny',
      resourceKind,
      resource,
      reason: '只读模式禁止写入',
      conversationId: context.conversationId,
    });
    return {
      behavior: 'deny',
      message: `当前为仅查询（只读）模式，禁止执行写入工具「${tool.title}」。`,
      reason: '只读模式禁止写入',
    };
  }

  if (allowModes(context.permissionMode, tool.defaultPermission, tool.readOnly)) {
    appendAIToolAuditLog({
      toolName: tool.name,
      behavior: 'allow',
      resourceKind,
      resource,
      reason: `权限模式允许：${context.permissionMode || tool.defaultPermission}`,
      conversationId: context.conversationId,
    });
    return { behavior: 'allow', reason: `权限模式允许：${context.permissionMode || tool.defaultPermission}` };
  }

  if (tool.defaultPermission === 'deny') {
    appendAIToolAuditLog({
      toolName: tool.name,
      behavior: 'deny',
      resourceKind,
      resource,
      reason: '工具默认拒绝',
      conversationId: context.conversationId,
    });
    return { behavior: 'deny', message: `工具 ${tool.title} 默认被拒绝。`, reason: '工具默认拒绝' };
  }

  const request: AIPermissionRequest = {
    id: `perm-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    toolName: tool.name,
    toolTitle: tool.title,
    resourceKind,
    resource,
    message: `工具「${tool.title}」请求访问 ${resourceKind}：${resource}`,
    inputPreview: previewInput(input),
    suggestions: buildSuggestions(tool.name, resourceKind, resource),
    createdAt: Date.now(),
  };

  appendAIToolAuditLog({
    toolName: tool.name,
    behavior: 'ask',
    resourceKind,
    resource,
    reason: '需要用户确认',
    conversationId: context.conversationId,
  });

  return {
    behavior: 'ask',
    message: request.message,
    reason: '需要用户确认',
    request,
  };
};
