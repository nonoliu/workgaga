import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export type LLMFetchInput = string | URL | Request;

const getRequestUrl = (input: LLMFetchInput): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const getRequestHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const withRequestContext = (error: unknown, url: string): Error => {
  const host = getRequestHost(url);
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`LLM 请求失败（${host}）：${message}`);
};

export const llmFetch = async (input: LLMFetchInput, init?: RequestInit): Promise<Response> => {
  const url = getRequestUrl(input);

  try {
    const fetcher = typeof tauriFetch === 'function' ? tauriFetch : globalThis.fetch?.bind(globalThis);
    if (!fetcher) {
      throw new Error('当前环境不支持 HTTP 请求。');
    }

    const response = await fetcher(input, init);
    return response as Response;
  } catch (error) {
    throw withRequestContext(error, url);
  }
};

export const requestLLM = llmFetch;

export const createLLMStatusError = (
  url: string,
  status: number,
  fallbackMessage = '请检查渠道配置或网络。',
): Error => {
  const host = getRequestHost(url);
  return new Error(`LLM 请求失败（${host}，HTTP ${status}）：${fallbackMessage}`);
};
