import { llmFetch } from '../llmHttpClient';
import { buildLLMRequestSpec, createDetailedLLMStatusError, extractProviderReply, getLLMStatusFallbackMessage } from './llmRequest';
import type { AIModelProvider, LLMMessage } from './llmTypes';
import type { AIRuntimeEvent } from './types';
import { executeAITool } from './tools';
import { parseStructuredChangePlan } from './structuredChangePlan';
import type { AIToolContext, AIToolRegistry } from './tools';
import {
  buildOpenAIToolAssistantMessage,
  buildOpenAIToolResultMessage,
  extractOpenAICompatibleToolCalls,
  parseLLMToolCallInput,
  toolDefinitionsToOpenAITools,
} from './toolCalling';

export interface OpenAIToolLoopInput {
  provider: AIModelProvider;
  baseUrl?: string;
  apiKey: string;
  model: string;
  messages: LLMMessage[];
  registry: AIToolRegistry;
  allowedToolNames?: string[];
  maxToolRounds?: number;
  maxTokens?: number;
  context?: AIToolContext;
  signal?: AbortSignal;
}

export interface OpenAIToolLoopResult {
  content: string;
  messages: LLMMessage[];
  events: AIRuntimeEvent[];
}

const emitAndStore = (events: AIRuntimeEvent[], event: AIRuntimeEvent, emit?: (event: AIRuntimeEvent) => void): void => {
  events.push(event);
  emit?.(event);
};

export const runOpenAIToolLoop = async (
  input: OpenAIToolLoopInput,
  emit?: (event: AIRuntimeEvent) => void,
): Promise<OpenAIToolLoopResult> => {
  const maxToolRounds = input.maxToolRounds ?? 4;
  const events: AIRuntimeEvent[] = [];
  const availableTools = input.allowedToolNames?.length
    ? input.registry.filter(input.allowedToolNames)
    : input.registry.list();
  const tools = toolDefinitionsToOpenAITools(availableTools);
  const messages: LLMMessage[] = [...input.messages];

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const { targetUrl, headers, body } = buildLLMRequestSpec({
      provider: input.provider,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      messages,
      maxTokens: input.maxTokens,
      stream: false,
      tools,
      toolChoice: tools.length ? 'auto' : 'none',
    });

    const response = await llmFetch(targetUrl, {
      method: 'POST',
      headers,
      signal: input.signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw await createDetailedLLMStatusError(response, targetUrl, getLLMStatusFallbackMessage(response.status));
    }

    const data = await response.json();
    const content = extractProviderReply(input.provider, data);
    const toolCalls = extractOpenAICompatibleToolCalls(data);

    if (!toolCalls.length) {
      emitAndStore(events, { type: 'assistant_message', content }, emit);
      return { content, messages, events };
    }

    messages.push(buildOpenAIToolAssistantMessage(content, toolCalls));
    const activePlan = parseStructuredChangePlan(content);
    if (activePlan) emitAndStore(events, { type: 'change_plan_detected', plan: activePlan }, emit);

    for (const toolCall of toolCalls) {
      const result = await executeAITool({
        registry: input.registry,
        call: parseLLMToolCallInput(toolCall),
        context: input.context?.writePlanGuard
          ? {
            ...input.context,
            writePlanGuard: {
              ...input.context.writePlanGuard,
              assistantPlanText: content,
              activePlan,
            },
          }
          : input.context,
        emit: (event) => emitAndStore(events, event, emit),
      });
      messages.push(buildOpenAIToolResultMessage(result));
    }
  }

  const error = `工具调用超过最大轮数（${maxToolRounds}）。`;
  emitAndStore(events, { type: 'error', error }, emit);
  throw new Error(error);
};
