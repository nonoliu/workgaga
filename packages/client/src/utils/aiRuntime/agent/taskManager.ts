import type { AIAgentRuntime } from './runtime';
import { writeAIAgentTaskOutput } from './taskOutput';
import type { AIAgentRunInput, AIAgentRunResult } from './types';

export type AIAgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

export interface AIAgentTask {
  id: string;
  agentType: string;
  description: string;
  status: AIAgentTaskStatus;
  startedAt: number;
  completedAt?: number;
  output?: string;
  outputFile?: string;
  error?: string;
  result?: AIAgentRunResult;
}

export interface AIAgentTaskStartResult {
  task: AIAgentTask;
  promise: Promise<AIAgentTask>;
}

const createAgentTaskId = (): string => `agent-task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toTaskStatus = (result: AIAgentRunResult): AIAgentTaskStatus => {
  if (result.status === 'completed') return 'completed';
  if (result.status === 'timeout') return 'timeout';
  if (result.status === 'cancelled') return 'cancelled';
  return 'failed';
};

export class AIAgentTaskManager {
  private readonly tasks = new Map<string, AIAgentTask>();

  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly runtime: AIAgentRuntime) {}

  start(input: AIAgentRunInput, description = input.agent.description): AIAgentTaskStartResult {
    const id = createAgentTaskId();
    const startedAt = Date.now();
    const controller = new AbortController();
    const task: AIAgentTask = {
      id,
      agentType: input.agent.type,
      description,
      status: 'running',
      startedAt,
    };
    this.tasks.set(id, task);
    this.controllers.set(id, controller);

    const promise = this.runtime.run({
      ...input,
      background: true,
      signal: controller.signal,
      context: {
        ...input.context,
        runId: input.context?.runId ?? id,
        metadata: {
          ...input.context?.metadata,
          backgroundTaskId: id,
        },
      },
    }).then(async (result) => {
      const completedAt = Date.now();
      const outputFile = await writeAIAgentTaskOutput(input.context?.workspace, id, result.outputText || result.error || '');
      const updated: AIAgentTask = {
        ...task,
        status: toTaskStatus(result),
        completedAt,
        output: result.outputText,
        outputFile,
        error: result.error,
        result,
      };
      this.tasks.set(id, updated);
      this.controllers.delete(id);
      return updated;
    }).catch((error) => {
      const completedAt = Date.now();
      const updated: AIAgentTask = {
        ...task,
        status: controller.signal.aborted ? 'cancelled' : 'failed',
        completedAt,
        error: error instanceof Error ? error.message : String(error),
      };
      this.tasks.set(id, updated);
      this.controllers.delete(id);
      return updated;
    });

    return { task, promise };
  }

  get(id: string): AIAgentTask | undefined {
    return this.tasks.get(id);
  }

  list(): AIAgentTask[] {
    return Array.from(this.tasks.values()).sort((left, right) => right.startedAt - left.startedAt);
  }

  cancel(id: string): boolean {
    const controller = this.controllers.get(id);
    if (!controller) return false;
    controller.abort();
    const task = this.tasks.get(id);
    if (task) {
      this.tasks.set(id, {
        ...task,
        status: 'cancelled',
        completedAt: Date.now(),
      });
    }
    this.controllers.delete(id);
    return true;
  }
}

export const createAIAgentTaskManager = (runtime: AIAgentRuntime): AIAgentTaskManager => new AIAgentTaskManager(runtime);
