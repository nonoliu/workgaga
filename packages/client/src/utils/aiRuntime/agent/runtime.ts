import { getRunTimeoutPolicy } from '../solver/timeoutPolicy';
import type { AIRuntimeEvent, AIRuntimeMessage } from '../types';
import { filterToolsForAIAgent } from './toolFilter';
import type { AIAgentExecuteResult, AIAgentExecutor, AIAgentRunContext, AIAgentRunInput, AIAgentRunResult, AIAgentRuntimeEvent } from './types';

const createAgentRunId = (): string => `agent-run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const isAsyncIterable = <T>(value: unknown): value is AsyncIterable<T> => Boolean(
  value
  && typeof value === 'object'
  && Symbol.asyncIterator in value,
);

const stringifyError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Agent 执行失败。';
  }
};

const createTimeoutSignal = (timeoutMs: number, parentSignal?: AbortSignal): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const abort = () => controller.abort();
  if (parentSignal?.aborted) abort();
  parentSignal?.addEventListener('abort', abort, { once: true });

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  return {
    signal: controller.signal,
    dispose: () => {
      if (timeoutId) clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abort);
    },
  };
};

const resolveTimeoutMs = (input: AIAgentRunInput): number => {
  if (input.timeoutMs) return input.timeoutMs;
  if (input.agent.timeoutMs) return input.agent.timeoutMs;
  if (input.intent && input.provider) {
    return getRunTimeoutPolicy({ intent: input.intent, provider: input.provider }).timeoutMs;
  }
  return 120000;
};

const createRunContext = (input: AIAgentRunInput, agentRunId: string): AIAgentRunContext => ({
  runId: input.context?.runId ?? agentRunId,
  parentRunId: input.context?.parentRunId,
  agentType: input.agent.type,
  cwd: input.context?.cwd ?? input.context?.workspace?.workingDirectory,
  workspace: input.context?.workspace,
  mode: input.agent.mode ?? input.context?.mode ?? 'execute',
  toolContext: input.context?.toolContext,
  metadata: {
    ...input.context?.metadata,
    background: input.background || input.agent.background || Boolean(input.context?.metadata?.backgroundTaskId),
  },
});

const getLastMessageContent = (messages: AIRuntimeMessage[]): string => messages.length ? messages[messages.length - 1].content : '';

const defaultExecute = async (input: { messages: AIRuntimeMessage[] }): Promise<AIAgentExecuteResult> => ({
  messages: input.messages,
  outputText: getLastMessageContent(input.messages),
});

export class AIAgentRuntime {
  constructor(private readonly defaultExecutor?: AIAgentExecutor) {}

  async run(input: AIAgentRunInput): Promise<AIAgentRunResult> {
    const events: AIRuntimeEvent[] = [];
    let finalResult: AIAgentRunResult | undefined;

    for await (const event of this.runStream(input)) {
      if (event.type === 'agent_complete') {
        finalResult = event.result;
      } else if (event.type !== 'agent_start' && event.type !== 'agent_error') {
        events.push(event);
      }
    }

    return finalResult ?? {
      agentRunId: input.context?.runId ?? 'unknown-agent-run',
      agentType: input.agent.type,
      status: 'failed',
      messages: input.messages,
      outputText: '',
      error: 'Agent 未返回完成事件。',
      events,
    };
  }

  async *runStream(input: AIAgentRunInput): AsyncGenerator<AIAgentRuntimeEvent> {
    const startedAt = Date.now();
    const agentRunId = input.context?.runId ?? createAgentRunId();
    const timeoutMs = resolveTimeoutMs(input);
    const timeout = createTimeoutSignal(timeoutMs, input.signal);
    const context = createRunContext(input, agentRunId);
    const tools = filterToolsForAIAgent(input.agent, input.tools ?? []);
    const events: AIRuntimeEvent[] = [];

    yield { type: 'agent_start', agentRunId, agentType: input.agent.type };

    try {
      const executor = input.execute ?? this.defaultExecutor ?? defaultExecute;
      const execution = executor({
        agent: input.agent,
        messages: input.messages,
        tools,
        context,
        signal: timeout.signal,
      });

      let executeResult: AIAgentExecuteResult | undefined;
      if (isAsyncIterable<AIRuntimeEvent>(execution)) {
        for await (const event of execution) {
          if (timeout.signal.aborted) throw new DOMException('Agent 执行超时或已取消。', 'AbortError');
          events.push(event);
          yield event;
        }
      } else {
        executeResult = await execution;
      }

      if (timeout.signal.aborted) throw new DOMException('Agent 执行超时或已取消。', 'AbortError');

      const messages = executeResult?.messages ?? input.messages;
      const completedAt = Date.now();
      const result: AIAgentRunResult = {
        agentRunId,
        agentType: input.agent.type,
        status: 'completed',
        messages,
        outputText: executeResult?.outputText ?? getLastMessageContent(messages),
        events: [...events, ...(executeResult?.events ?? [])],
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
      };
      yield { type: 'agent_complete', result };
    } catch (error) {
      const aborted = timeout.signal.aborted || input.signal?.aborted;
      const completedAt = Date.now();
      const result: AIAgentRunResult = {
        agentRunId,
        agentType: input.agent.type,
        status: aborted ? 'timeout' : 'failed',
        messages: input.messages,
        outputText: '',
        error: stringifyError(error),
        events,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
      };
      yield { type: 'agent_error', agentRunId, agentType: input.agent.type, error: result.error ?? 'Agent 执行失败。' };
      yield { type: 'agent_complete', result };
    } finally {
      timeout.dispose();
    }
  }
}

export const createAIAgentRuntime = (defaultExecutor?: AIAgentExecutor): AIAgentRuntime => new AIAgentRuntime(defaultExecutor);
