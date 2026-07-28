import { createLLMStatusError } from '../llmHttpClient';
import type { AIModelProvider, BuildLLMRequestSpecParams, LLMRequestSpec } from './llmTypes';

export const trimBaseUrl = (baseUrl?: string): string => (baseUrl || '').trim().replace(/\/+$/, '');

export const appendQueryParam = (input: string, key: string, value: string): string => {
  try {
    const url = new URL(input);
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    const separator = input.includes('?') ? '&' : '?';
    return `${input}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
};

export const pathEndsWith = (input: string, suffix: string): boolean => {
  try {
    return new URL(input).pathname.replace(/\/+$/, '').endsWith(suffix);
  } catch {
    return input.replace(/\/+$/, '').endsWith(suffix);
  }
};

export const buildOpenAICompatibleTargetUrl = (provider: AIModelProvider, baseUrl?: string): string => {
  const defaultBase = provider === 'openrouter'
    ? 'https://openrouter.ai/api'
    : provider === 'vercelai_gateway'
      ? 'https://api.vercel.ai'
      : 'https://api.openai.com';
  const resolvedBase = trimBaseUrl(baseUrl) || defaultBase;

  if (pathEndsWith(resolvedBase, '/chat/completions')) return resolvedBase;
  if (pathEndsWith(resolvedBase, '/v1')) return `${resolvedBase}/chat/completions`;
  return `${resolvedBase}/v1/chat/completions`;
};

export const buildAnthropicTargetUrl = (baseUrl?: string): string => {
  const resolvedBase = trimBaseUrl(baseUrl) || 'https://api.anthropic.com';

  if (pathEndsWith(resolvedBase, '/messages')) return resolvedBase;
  if (pathEndsWith(resolvedBase, '/v1')) return `${resolvedBase}/messages`;
  return `${resolvedBase}/v1/messages`;
};

export const buildGeminiTargetUrl = (baseUrl: string | undefined, apiKey: string, model: string): string => {
  const resolvedBase = trimBaseUrl(baseUrl);
  const encodedModel = encodeURIComponent(model);

  if (!resolvedBase) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
  }

  if (resolvedBase.includes(':generateContent')) {
    return appendQueryParam(resolvedBase, 'key', apiKey);
  }

  if (pathEndsWith(resolvedBase, `/models/${model}`) || pathEndsWith(resolvedBase, `/models/${encodedModel}`)) {
    return appendQueryParam(`${resolvedBase}:generateContent`, 'key', apiKey);
  }

  if (pathEndsWith(resolvedBase, '/v1beta') || pathEndsWith(resolvedBase, '/v1')) {
    return appendQueryParam(`${resolvedBase}/models/${encodedModel}:generateContent`, 'key', apiKey);
  }

  return appendQueryParam(`${resolvedBase}/v1beta/models/${encodedModel}:generateContent`, 'key', apiKey);
};

export const buildLLMRequestSpec = (params: BuildLLMRequestSpecParams): LLMRequestSpec => {
  const { provider, baseUrl, apiKey, model, messages, maxTokens, stream, tools, toolChoice } = params;
  let targetUrl = '';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: Record<string, unknown> = {};

  if (provider === 'anthropic') {
    targetUrl = buildAnthropicTargetUrl(baseUrl);
    headers = {
      ...headers,
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    body = {
      model,
      max_tokens: maxTokens ?? 1024,
      messages: messages.map((item) => ({
        role: item.role === 'system' ? 'user' : item.role,
        content: item.content,
      })),
    };
    return { targetUrl, headers, body };
  }

  if (provider === 'gemini') {
    targetUrl = buildGeminiTargetUrl(baseUrl, apiKey, model);
    body = {
      contents: messages
        .filter((item) => item.role !== 'system')
        .map((item) => ({
          role: item.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: item.content }],
        })),
    };
    return { targetUrl, headers, body };
  }

  targetUrl = buildOpenAICompatibleTargetUrl(provider, baseUrl);
  headers = {
    ...headers,
    Authorization: `Bearer ${apiKey}`,
  };
  body = {
    model,
    messages,
    ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
    ...(stream ? { stream: true } : {}),
    ...(tools?.length ? { tools, tool_choice: toolChoice ?? 'auto' } : {}),
  };
  return { targetUrl, headers, body };
};

export const isEventStreamResponse = (response: Response): boolean =>
  (response.headers.get('content-type') || '').toLowerCase().includes('text/event-stream');

export const extractOpenAICompatibleReply = (data: unknown): string => {
  const choice = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === 'string'
        ? item
        : typeof item === 'object' && item && 'text' in item && typeof item.text === 'string'
          ? item.text
          : ''))
      .join('');
  }
  return '';
};

export const extractAnthropicReply = (data: unknown): string => {
  const content = (data as { content?: Array<{ text?: unknown }> })?.content?.[0]?.text;
  return typeof content === 'string' ? content : '';
};

export const extractGeminiReply = (data: unknown): string => {
  const text = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> })?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === 'string' ? text : '';
};

export const extractProviderReply = (provider: AIModelProvider, data: unknown): string => {
  if (provider === 'anthropic') return extractAnthropicReply(data);
  if (provider === 'gemini') return extractGeminiReply(data);
  return extractOpenAICompatibleReply(data);
};

export const extractLLMErrorDetail = (data: unknown): string => {
  if (!data) return '';
  if (typeof data === 'string') return data.trim();
  if (typeof data !== 'object') return '';

  const record = data as {
    error?: unknown;
    message?: unknown;
    detail?: unknown;
    details?: unknown;
  };

  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
  if (typeof record.detail === 'string' && record.detail.trim()) return record.detail.trim();

  if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
  if (record.error && typeof record.error === 'object') {
    const nested = record.error as { message?: unknown; detail?: unknown; type?: unknown };
    if (typeof nested.message === 'string' && nested.message.trim()) return nested.message.trim();
    if (typeof nested.detail === 'string' && nested.detail.trim()) return nested.detail.trim();
    if (typeof nested.type === 'string' && nested.type.trim()) return nested.type.trim();
  }

  if (Array.isArray(record.details)) {
    const firstText = record.details.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (firstText) return firstText.trim();
  }

  return '';
};

export const createDetailedLLMStatusError = async (response: Response, targetUrl: string, fallbackMessage: string): Promise<Error> => {
  try {
    const rawText = await response.text();
    const trimmed = rawText.trim();
    if (!trimmed) {
      return createLLMStatusError(targetUrl, response.status, fallbackMessage);
    }

    try {
      const data = JSON.parse(trimmed);
      const detail = extractLLMErrorDetail(data);
      return createLLMStatusError(targetUrl, response.status, detail || fallbackMessage);
    } catch {
      const detail = trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
      return createLLMStatusError(targetUrl, response.status, detail || fallbackMessage);
    }
  } catch {
    return createLLMStatusError(targetUrl, response.status, fallbackMessage);
  }
};

export const getLLMStatusFallbackMessage = (status: number): string => {
  if (status === 400) return '请求参数无效，请检查模型名称、Base URL 或请求格式。';
  if (status === 401) return '认证失败，请检查 API Key 是否正确。';
  if (status === 403) return '当前 API Key 没有访问该模型或渠道的权限。';
  if (status === 404) return '目标接口或模型不存在，请检查 Base URL 与模型名称。';
  if (status === 408) return '请求超时，请检查网络或稍后重试。';
  if (status === 409 || status === 422) return '请求被服务端拒绝，请检查模型、消息格式或服务兼容性。';
  if (status === 429) return '请求过于频繁或额度不足，请稍后重试。';
  if (status >= 500) return '模型服务暂时不可用，请稍后重试。';
  return '请检查渠道配置或网络。';
};

export const getLLMAdapterCapabilities = (provider: AIModelProvider) => ({
  supportsStreaming: provider !== 'anthropic' && provider !== 'gemini',
  supportsToolCalling: provider !== 'gemini',
});
