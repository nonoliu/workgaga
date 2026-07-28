import { runAnthropicToolLoop } from '../anthropicToolLoop';
import { runGeminiToolLoop } from '../geminiToolLoop';
import type { AIModelProvider, LLMMessage } from '../llmTypes';
import { runOpenAIToolLoop } from '../openAIToolLoop';
import type { AIToolRegistry } from '../tools';
import { createAIToolRegistry } from '../tools';
import type { AIRuntimeEvent, AIRuntimeMessage } from '../types';
import type { AIAgentExecuteInput, AIAgentExecuteResult, AIAgentExecutor } from './types';

export interface AIAgentLLMExecutorOptions {
  provider: AIModelProvider;
  baseUrl?: string;
  apiKey: string;
  model: string;
  registry?: AIToolRegistry;
  maxTokens?: number;
  maxToolRounds?: number;
}

const resolveSystemPrompt = (systemPrompt: AIAgentExecuteInput['agent']['systemPrompt']): string => (
  typeof systemPrompt === 'function' ? systemPrompt() : systemPrompt
);

const toLLMMessages = (input: AIAgentExecuteInput): LLMMessage[] => {
  const systemPrompt = resolveSystemPrompt(input.agent.systemPrompt);
  const messages: LLMMessage[] = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];

  input.messages.forEach((message) => {
    messages.push({
      role: message.role,
      content: message.content,
    });
  });

  return messages;
};

const toRuntimeMessages = (messages: LLMMessage[]): AIRuntimeMessage[] => messages.map((message) => ({
  role: message.role === 'system' || message.role === 'assistant' || message.role === 'tool' ? message.role : 'user',
  content: message.content,
}));

const appendAssistantMessage = (messages: AIRuntimeMessage[], content: string): AIRuntimeMessage[] => [
  ...messages,
  { role: 'assistant', content, status: 'completed', createdAt: Date.now() },
];

export const createAIAgentLLMExecutor = (options: AIAgentLLMExecutorOptions): AIAgentExecutor => async (
  input: AIAgentExecuteInput,
): Promise<AIAgentExecuteResult> => {
  const registry = options.registry ?? createAIToolRegistry(input.tools);
  const messages = toLLMMessages(input);
  const allowedToolNames = input.tools.map((tool) => tool.name);
  const context = {
    ...input.context.toolContext,
    workspace: input.context.workspace ?? input.context.toolContext?.workspace,
    signal: input.signal,
    metadata: {
      ...input.context.toolContext?.metadata,
      ...input.context.metadata,
      agentRunId: input.context.runId,
      agentType: input.agent.type,
      agentMode: input.context.mode,
    },
  };
  const events: AIRuntimeEvent[] = [];
  const emit = (event: AIRuntimeEvent) => events.push(event);
  const maxToolRounds = options.maxToolRounds ?? input.agent.maxTurns;

  if (options.provider === 'anthropic') {
    const result = await runAnthropicToolLoop({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: input.agent.model && input.agent.model !== 'inherit' ? input.agent.model : options.model,
      messages,
      registry,
      allowedToolNames,
      maxToolRounds,
      maxTokens: options.maxTokens,
      context,
      signal: input.signal,
    }, emit);
    return {
      messages: appendAssistantMessage(input.messages, result.content),
      outputText: result.content,
      events: [...events, ...result.events],
    };
  }

  if (options.provider === 'gemini') {
    const result = await runGeminiToolLoop({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: input.agent.model && input.agent.model !== 'inherit' ? input.agent.model : options.model,
      messages,
      registry,
      allowedToolNames,
      maxToolRounds,
      context,
      signal: input.signal,
    }, emit);
    return {
      messages: appendAssistantMessage(input.messages, result.content),
      outputText: result.content,
      events: [...events, ...result.events],
    };
  }

  const result = await runOpenAIToolLoop({
    provider: options.provider,
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    model: input.agent.model && input.agent.model !== 'inherit' ? input.agent.model : options.model,
    messages,
    registry,
    allowedToolNames,
    maxToolRounds,
    maxTokens: options.maxTokens,
    context,
    signal: input.signal,
  }, emit);

  return {
    messages: toRuntimeMessages(result.messages),
    outputText: result.content,
    events: [...events, ...result.events],
  };
};
