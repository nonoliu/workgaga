import { llmFetch } from '../llmHttpClient';
import { buildAnthropicTargetUrl, createDetailedLLMStatusError, getLLMStatusFallbackMessage } from './llmRequest';
import type { LLMMessage } from './llmTypes';
import type { AIRuntimeEvent } from './types';
import { executeAITool } from './tools';
import { parseStructuredChangePlan } from './structuredChangePlan';
import type { AIToolContext, AIToolRegistry } from './tools';

interface AnthropicToolLoopInput {
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

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

export interface AnthropicToolLoopResult {
  content: string;
  events: AIRuntimeEvent[];
}

const emitAndStore = (events: AIRuntimeEvent[], event: AIRuntimeEvent, emit?: (event: AIRuntimeEvent) => void): void => {
  events.push(event);
  emit?.(event);
};

const toAnthropicTools = (registry: AIToolRegistry, allowedToolNames?: string[]) => {
  const tools = allowedToolNames?.length ? registry.filter(allowedToolNames) : registry.list();
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
};

const splitSystemAndMessages = (messages: LLMMessage[]): { system: string; messages: AnthropicMessage[] } => {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter(Boolean)
    .join('\n\n');
  const anthropicMessages = messages
    .filter((message) => message.role !== 'system' && message.role !== 'tool')
    .map((message): AnthropicMessage => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));
  return { system, messages: anthropicMessages };
};

const extractText = (blocks: AnthropicContentBlock[]): string => blocks
  .filter((block) => block.type === 'text' && typeof block.text === 'string')
  .map((block) => block.text)
  .join('');

const extractToolUses = (blocks: AnthropicContentBlock[]) => blocks
  .filter((block) => block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string')
  .map((block) => ({
    id: block.id as string,
    name: block.name as string,
    input: block.input ?? {},
  }));

export const runAnthropicToolLoop = async (
  input: AnthropicToolLoopInput,
  emit?: (event: AIRuntimeEvent) => void,
): Promise<AnthropicToolLoopResult> => {
  const maxToolRounds = input.maxToolRounds ?? 4;
  const events: AIRuntimeEvent[] = [];
  const tools = toAnthropicTools(input.registry, input.allowedToolNames);
  const { system, messages } = splitSystemAndMessages(input.messages);

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const response = await llmFetch(buildAnthropicTargetUrl(input.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens ?? 1024,
        ...(system ? { system } : {}),
        messages,
        ...(tools.length ? { tools, tool_choice: { type: 'auto' } } : {}),
      }),
    });

    if (!response.ok) {
      throw await createDetailedLLMStatusError(response, buildAnthropicTargetUrl(input.baseUrl), getLLMStatusFallbackMessage(response.status));
    }

    const data = await response.json() as { content?: AnthropicContentBlock[] };
    const blocks = Array.isArray(data.content) ? data.content : [];
    const content = extractText(blocks);
    const toolUses = extractToolUses(blocks);

    if (!toolUses.length) {
      emitAndStore(events, { type: 'assistant_message', content }, emit);
      return { content, events };
    }

    messages.push({ role: 'assistant', content: blocks as unknown as Array<Record<string, unknown>> });
    const activePlan = parseStructuredChangePlan(content);
    if (activePlan) emitAndStore(events, { type: 'change_plan_detected', plan: activePlan }, emit);

    const toolResultBlocks = [];
    for (const toolUse of toolUses) {
      const result = await executeAITool({
        registry: input.registry,
        call: {
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        },
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
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result.error ? { error: result.error } : result.output),
      });
    }

    messages.push({ role: 'user', content: toolResultBlocks });
  }

  const error = `Anthropic 工具调用超过最大轮数（${maxToolRounds}）。`;
  emitAndStore(events, { type: 'error', error }, emit);
  throw new Error(error);
};
