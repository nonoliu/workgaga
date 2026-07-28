import type { AIRuntimeEvent, AIRuntimeMessage } from './types';

export interface AgentLoopInput {
  messages: AIRuntimeMessage[];
  maxToolRounds?: number;
}

export interface AgentLoopHandlers {
  complete(input: AgentLoopInput): AsyncGenerator<AIRuntimeEvent>;
}

export async function* runAgentLoop(input: AgentLoopInput, handlers: AgentLoopHandlers): AsyncGenerator<AIRuntimeEvent> {
  yield* handlers.complete(input);
}
