import type { AIModelProvider } from '../llmTypes';
import type { AIProblemIntent } from './types';

export interface AIRunTimeoutPolicy {
  intent: AIProblemIntent;
  provider: AIModelProvider;
  timeoutMs: number;
  reason: string;
}

const intentTimeouts: Partial<Record<AIProblemIntent, number>> = {
  weather_query: 45000,
  realtime_query: 60000,
  web_research: 90000,
  url_reading: 60000,
  knowledge_lookup: 45000,
  code_understanding: 90000,
  code_modification: 180000,
  troubleshooting: 180000,
  document_generation: 120000,
};

const providerTimeouts: Partial<Record<AIModelProvider, number>> = {
  anthropic: 180000,
  gemini: 180000,
  openai: 180000,
  openrouter: 180000,
  vercelai_gateway: 180000,
  custom: 180000,
};

export const getRunTimeoutPolicy = (params: {
  intent: AIProblemIntent;
  provider: AIModelProvider;
}): AIRunTimeoutPolicy => {
  const intentTimeout = intentTimeouts[params.intent] ?? 120000;
  const providerTimeout = providerTimeouts[params.provider] ?? 120000;
  const timeoutMs = Math.max(intentTimeout, providerTimeout);

  return {
    intent: params.intent,
    provider: params.provider,
    timeoutMs,
    reason: `运行超时策略：intent=${params.intent}, provider=${params.provider}, timeout=${Math.round(timeoutMs / 1000)}s`,
  };
};
