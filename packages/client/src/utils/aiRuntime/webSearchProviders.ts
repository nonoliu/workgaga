import { llmFetch } from '../llmHttpClient';

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 30_000;

export interface WebSearchProviderAttempt {
  providerId: string;
  providerName: string;
  query: string;
  ok: boolean;
  resultCount: number;
  error?: string;
}

export interface WebSearchQueryAttempt {
  query: string;
  providerId: string;
  providerName: string;
  results: WebSearchResultItem[];
  error?: string;
}

export interface WebSearchProviderResponse {
  providerId: string;
  providerName: string;
  results: WebSearchResultItem[];
}

export interface WebSearchProvider {
  id: string;
  name: string;
  search(params: {
    query: string;
    maxResults: number;
  }): Promise<WebSearchProviderResponse>;
}

const stripHtmlToText = (html: string): string => html
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const extractDuckDuckGoLiteResults = (html: string): WebSearchResultItem[] => {
  const rows = Array.from(html.matchAll(/<a rel="nofollow" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td class="result-snippet">([\s\S]*?)<\/td>/gi));
  return rows.slice(0, 8).map((match) => ({
    url: stripHtmlToText(match[1]),
    title: stripHtmlToText(match[2]),
    snippet: stripHtmlToText(match[3]),
  })).filter((item) => item.title || item.snippet);
};

const duckDuckGoLiteProvider: WebSearchProvider = {
  id: 'duckduckgo-lite',
  name: 'DuckDuckGo Lite',
  async search(params) {
    const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(params.query)}`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), DEFAULT_WEB_SEARCH_TIMEOUT_MS);
    try {
      const response = await llmFetch(searchUrl, { method: 'GET', signal: controller.signal });
      const html = await response.text();
      return {
        providerId: 'duckduckgo-lite',
        providerName: 'DuckDuckGo Lite',
        results: extractDuckDuckGoLiteResults(html).slice(0, params.maxResults),
      };
    } finally {
      window.clearTimeout(timeout);
    }
  },
};

export const getWebSearchProviders = (): WebSearchProvider[] => [
  duckDuckGoLiteProvider,
];
