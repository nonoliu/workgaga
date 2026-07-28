import type { LLMMessage, LLMToolCall, LLMToolDefinition } from './llmTypes';
import type { AIToolCallExecutionResult, AIToolCallRequest, AIToolDefinition } from './tools';

export const toolDefinitionsToOpenAITools = (tools: AIToolDefinition[]): LLMToolDefinition[] => tools.map((tool) => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  },
}));

export const extractOpenAICompatibleToolCalls = (data: unknown): LLMToolCall[] => {
  const toolCalls = (data as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{
          id?: unknown;
          type?: unknown;
          function?: { name?: unknown; arguments?: unknown };
        }>;
      };
    }>;
  })?.choices?.[0]?.message?.tool_calls;

  if (!Array.isArray(toolCalls)) return [];

  return toolCalls
    .map((item, index): LLMToolCall | null => {
      const name = item.function?.name;
      if (typeof name !== 'string' || !name.trim()) return null;
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id : `tool-call-${index}`,
        name,
        argumentsText: typeof item.function?.arguments === 'string' ? item.function.arguments : '{}',
      };
    })
    .filter((item): item is LLMToolCall => Boolean(item));
};

export const parseLLMToolCallInput = (call: LLMToolCall): AIToolCallRequest => {
  try {
    return { id: call.id, name: call.name, input: JSON.parse(call.argumentsText || '{}') };
  } catch {
    return { id: call.id, name: call.name, input: {} };
  }
};

export const buildOpenAIToolAssistantMessage = (content: string, toolCalls: LLMToolCall[]): LLMMessage => ({
  role: 'assistant',
  content,
  tool_calls: toolCalls.map((call) => ({
    id: call.id,
    type: 'function',
    function: {
      name: call.name,
      arguments: call.argumentsText || '{}',
    },
  })),
});

export const buildOpenAIToolResultMessage = (result: AIToolCallExecutionResult): LLMMessage => ({
  role: 'tool',
  tool_call_id: result.callId,
  content: JSON.stringify(result.error ? { error: result.error } : result.output),
});
