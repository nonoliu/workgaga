import { llmFetch } from '../llmHttpClient';
import { buildGeminiTargetUrl, createDetailedLLMStatusError, getLLMStatusFallbackMessage } from './llmRequest';
import type { LLMMessage } from './llmTypes';
import type { AIRuntimeEvent } from './types';
import { executeAITool } from './tools';
import { parseStructuredChangePlan } from './structuredChangePlan';
import type { AIToolContext, AIToolRegistry } from './tools';

interface GeminiToolLoopInput {
  baseUrl?: string;
  apiKey: string;
  model: string;
  messages: LLMMessage[];
  registry: AIToolRegistry;
  allowedToolNames?: string[];
  maxToolRounds?: number;
  context?: AIToolContext;
  signal?: AbortSignal;
}

interface GeminiPart {
  text?: string;
  functionCall?: {
    name?: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiToolLoopResult {
  content: string;
  events: AIRuntimeEvent[];
}

const emitAndStore = (events: AIRuntimeEvent[], event: AIRuntimeEvent, emit?: (event: AIRuntimeEvent) => void): void => {
  events.push(event);
  emit?.(event);
};

const toGeminiTools = (registry: AIToolRegistry, allowedToolNames?: string[]) => {
  const tools = allowedToolNames?.length ? registry.filter(allowedToolNames) : registry.list();
  return [{
    functionDeclarations: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  }];
};

const toGeminiContents = (messages: LLMMessage[]): GeminiContent[] => messages
  .filter((message) => message.role !== 'system' && message.role !== 'tool')
  .map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

const buildSystemInstruction = (messages: LLMMessage[]) => {
  const text = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter(Boolean)
    .join('\n\n');
  return text ? { parts: [{ text }] } : undefined;
};

const extractText = (parts: GeminiPart[]): string => parts
  .filter((part) => typeof part.text === 'string')
  .map((part) => part.text || '')
  .join('');

const extractFunctionCalls = (parts: GeminiPart[]) => parts
  .map((part) => part.functionCall)
  .filter((call): call is { name: string; args?: Record<string, unknown> } => Boolean(call?.name));

export const runGeminiToolLoop = async (
  input: GeminiToolLoopInput,
  emit?: (event: AIRuntimeEvent) => void,
): Promise<GeminiToolLoopResult> => {
  const maxToolRounds = input.maxToolRounds ?? 4;
  const events: AIRuntimeEvent[] = [];
  const contents = toGeminiContents(input.messages);
  const tools = toGeminiTools(input.registry, input.allowedToolNames);
  const systemInstruction = buildSystemInstruction(input.messages);

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const response = await llmFetch(buildGeminiTargetUrl(input.baseUrl, input.apiKey, input.model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: input.signal,
      body: JSON.stringify({
        contents,
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(tools[0].functionDeclarations.length ? { tools, toolConfig: { functionCallingConfig: { mode: 'AUTO' } } } : {}),
      }),
    });

    if (!response.ok) {
      throw await createDetailedLLMStatusError(response, buildGeminiTargetUrl(input.baseUrl, input.apiKey, input.model), getLLMStatusFallbackMessage(response.status));
    }

    const data = await response.json() as { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = extractText(parts);
    const functionCalls = extractFunctionCalls(parts);

    if (!functionCalls.length) {
      emitAndStore(events, { type: 'assistant_message', content: text }, emit);
      return { content: text, events };
    }

    contents.push({ role: 'model', parts });
    const activePlan = parseStructuredChangePlan(text);
    if (activePlan) emitAndStore(events, { type: 'change_plan_detected', plan: activePlan }, emit);

    const responseParts: GeminiPart[] = [];
    for (const call of functionCalls) {
      const result = await executeAITool({
        registry: input.registry,
        call: {
          id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: call.name,
          input: call.args ?? {},
        },
        context: input.context?.writePlanGuard
          ? {
            ...input.context,
            writePlanGuard: {
              ...input.context.writePlanGuard,
              assistantPlanText: text,
              activePlan,
            },
          }
          : input.context,
        emit: (event) => emitAndStore(events, event, emit),
      });
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: result.error ? { error: result.error } : { result: result.output },
        },
      });
    }

    contents.push({ role: 'user', parts: responseParts });
  }

  const error = `Gemini 工具调用超过最大轮数（${maxToolRounds}）。`;
  emitAndStore(events, { type: 'error', error }, emit);
  throw new Error(error);
};
