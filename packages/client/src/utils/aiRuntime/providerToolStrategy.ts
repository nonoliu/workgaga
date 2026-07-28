import type { AIModelProvider } from './llmTypes';

export type AIProviderToolMode = 'native-tools' | 'preflight-only' | 'none';

export interface AIProviderToolStrategy {
  provider: AIModelProvider;
  toolMode: AIProviderToolMode;
  supportsStreaming: boolean;
  supportsNativeToolCalling: boolean;
  supportsForcedToolChoice: boolean;
  notes: string[];
}

export const getProviderToolStrategy = (provider: AIModelProvider): AIProviderToolStrategy => {
  switch (provider) {
    case 'openai':
    case 'openrouter':
    case 'vercelai_gateway':
    case 'custom':
      return {
        provider,
        toolMode: 'native-tools',
        supportsStreaming: true,
        supportsNativeToolCalling: true,
        supportsForcedToolChoice: true,
        notes: ['OpenAI-compatible tools are available through the current tool loop.'],
      };
    case 'anthropic':
      return {
        provider,
        toolMode: 'native-tools',
        supportsStreaming: false,
        supportsNativeToolCalling: true,
        supportsForcedToolChoice: false,
        notes: ['Anthropic native tool_use/tool_result loop is available. Streaming remains disabled for this provider path.'],
      };
    case 'gemini':
      return {
        provider,
        toolMode: 'native-tools',
        supportsStreaming: false,
        supportsNativeToolCalling: true,
        supportsForcedToolChoice: false,
        notes: ['Gemini native function calling loop is available. Streaming remains disabled for this provider path.'],
      };
    default:
      return {
        provider,
        toolMode: 'preflight-only',
        supportsStreaming: false,
        supportsNativeToolCalling: false,
        supportsForcedToolChoice: false,
        notes: ['Unknown provider. Use runtime preflight tools and regular completion only.'],
      };
  }
};
