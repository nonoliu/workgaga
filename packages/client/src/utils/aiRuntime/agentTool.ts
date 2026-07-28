import { getAIAgentFeatureFlags, type AIAgentRegistry, type AIAgentRuntime, type AIAgentTaskManager } from './agent';
import type { AIToolContext, AIToolDefinition } from './tools';

export interface AgentToolInput {
  agentId: string;
  task: string;
  background?: boolean;
  description?: string;
  maxTurns?: number;
  timeoutMs?: number;
}

export interface CreateAgentToolOptions {
  registry: AIAgentRegistry;
  runtime: AIAgentRuntime;
  taskManager?: AIAgentTaskManager;
  tools?: AIToolDefinition[];
}

const isCreateAgentToolOptions = (value: string[] | CreateAgentToolOptions): value is CreateAgentToolOptions => !Array.isArray(value);

const getAvailableAgentIds = (options: string[] | CreateAgentToolOptions): string[] => (
  isCreateAgentToolOptions(options) ? options.registry.list().map((agent) => agent.type) : options
);

export function createAgentTool(availableAgentIds: string[]): AIToolDefinition<AgentToolInput>;
export function createAgentTool(options: CreateAgentToolOptions): AIToolDefinition<AgentToolInput>;
export function createAgentTool(options: string[] | CreateAgentToolOptions): AIToolDefinition<AgentToolInput> {
  const availableAgentIds = getAvailableAgentIds(options);

  return {
    name: 'run-agent',
    title: '运行 Agent',
    description: 'Delegate a sub-task to another configured Agent and return the sub-agent result.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Target agent id.' },
        task: { type: 'string', description: 'Task to delegate.' },
        background: { type: 'boolean', description: 'Whether to run the agent in background.' },
        description: { type: 'string', description: 'Short task description.' },
        maxTurns: { type: 'number', description: 'Maximum tool/model rounds for this agent run.' },
        timeoutMs: { type: 'number', description: 'Timeout for this agent run in milliseconds.' },
      },
      required: ['agentId', 'task'],
      additionalProperties: false,
    },
    readOnly: true,
    concurrencySafe: false,
    defaultPermission: 'ask',
    validate(input) {
      if (!input || typeof input !== 'object') return { ok: false, message: '工具参数必须是对象。' };
      const record = input as Record<string, unknown>;
      const agentId = typeof record.agentId === 'string' ? record.agentId.trim() : '';
      const task = typeof record.task === 'string' ? record.task.trim() : '';
      const description = typeof record.description === 'string' ? record.description.trim() : undefined;
      const background = typeof record.background === 'boolean' ? record.background : undefined;
      const maxTurns = typeof record.maxTurns === 'number' && Number.isFinite(record.maxTurns) ? record.maxTurns : undefined;
      const timeoutMs = typeof record.timeoutMs === 'number' && Number.isFinite(record.timeoutMs) ? record.timeoutMs : undefined;
      if (!agentId) return { ok: false, message: '缺少 agentId。' };
      if (!availableAgentIds.includes(agentId)) return { ok: false, message: `Agent 不存在或不可用：${agentId}` };
      if (!task) return { ok: false, message: '缺少 task。' };
      return { ok: true, input: { agentId, task, background, description, maxTurns, timeoutMs } };
    },
    checkPermission() {
      return { behavior: 'allow', reason: '已通过统一权限引擎。' };
    },
    async call(input, context: AIToolContext) {
      if (!isCreateAgentToolOptions(options)) {
        return {
          delegated: false,
          agentId: input.agentId,
          task: input.task,
          message: 'run-agent 当前以兼容模式创建；未提供 registry/runtime，无法执行子 Agent。',
        };
      }

      const agent = options.registry.get(input.agentId);
      if (!agent) {
        return {
          delegated: false,
          agentId: input.agentId,
          task: input.task,
          error: `Agent 不存在或不可用：${input.agentId}`,
        };
      }

      const runInput = {
        agent: {
          ...agent,
          maxTurns: input.maxTurns ?? agent.maxTurns,
        },
        messages: [{ role: 'user' as const, content: input.task, createdAt: Date.now() }],
        tools: (options.tools ?? []).filter((tool) => tool.name !== 'run-agent'),
        context: {
          parentRunId: typeof context.metadata?.agentRunId === 'string' ? context.metadata.agentRunId : undefined,
          toolContext: {
            ...context,
            metadata: {
              ...context.metadata,
              delegatedByTool: 'run-agent',
              agentTaskDescription: input.description,
            },
          },
        },
        timeoutMs: input.timeoutMs,
        background: input.background,
      };

      const featureFlags = getAIAgentFeatureFlags();
      if (!featureFlags.enabled) {
        return {
          delegated: false,
          agentId: input.agentId,
          task: input.task,
          message: 'Agent Runtime 已通过 feature flag 关闭。',
        };
      }
      if (featureFlags.backgroundEnabled && (input.background || agent.background) && options.taskManager) {
        const { task } = options.taskManager.start(runInput, input.description || input.task.slice(0, 120));
        return {
          delegated: true,
          background: true,
          agentId: input.agentId,
          task: input.task,
          taskId: task.id,
          status: task.status,
          message: `Agent 已在后台启动：${task.id}`,
        };
      }

      const result = await options.runtime.run(runInput);

      return {
        delegated: true,
        background: false,
        agentId: input.agentId,
        task: input.task,
        status: result.status,
        outputText: result.outputText,
        error: result.error,
        durationMs: result.durationMs,
      };
    },
  };
}
