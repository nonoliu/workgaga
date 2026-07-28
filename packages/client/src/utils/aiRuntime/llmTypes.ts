export type AIModelProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'vercelai_gateway' | 'custom';

export interface LLMToolCall {
  id: string;
  name: string;
  argumentsText: string;
}

export interface LLMMessage {
  role: string;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMRequestSpec {
  targetUrl: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface BuildLLMRequestSpecParams {
  provider: AIModelProvider;
  baseUrl?: string;
  apiKey: string;
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  stream?: boolean;
  tools?: LLMToolDefinition[];
  toolChoice?: 'auto' | 'none';
}

export interface LLMAdapterCapabilities {
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
}
