import type { AIIntentDetectionResult } from './types';

const extractCandidateUrls = (output: unknown): string[] => {
  if (!output || typeof output !== 'object') return [];
  const results = (output as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string')
    .map((item) => String((item as Record<string, unknown>).url))
    .filter((url, index, list) => url.startsWith('http') && list.indexOf(url) === index)
    .slice(0, 5);
};

const buildWeatherFallbackQuery = (params: { userInput: string; detection: AIIntentDetectionResult }): string => {
  const city = params.detection.entities?.city;
  return city
    ? `${city} 最近3天天气预报 中国天气 中央气象台 官方`
    : `${params.userInput} 中国天气 中央气象台 官方`;
};

const buildGenericAlternateQueries = (input: string): string[] => [
  `${input} 最新`,
  `${input} 2026`,
  `${input} 官方`,
  `${input} 来源`,
].filter((query, index, list) => query.trim().length >= 2 && list.indexOf(query) === index);

export const buildFallbackToolInput = (params: {
  toolName: string;
  userInput: string;
  detection: AIIntentDetectionResult;
  previousOutput?: unknown;
}): Record<string, unknown> | null => {
  switch (params.toolName) {
    case 'web-search': {
      if (params.detection.intent === 'weather_query') {
        return {
          query: buildWeatherFallbackQuery(params),
          alternateQueries: buildGenericAlternateQueries(params.userInput),
          domainHints: ['中国天气', '中央气象台', '官方'],
          maxResults: 5,
        };
      }
      return {
        query: params.userInput,
        alternateQueries: buildGenericAlternateQueries(params.userInput),
        domainHints: ['官方', '新闻', '数据来源'],
        maxResults: 5,
      };
    }
    case 'web-fetch': {
      const candidateUrls = extractCandidateUrls(params.previousOutput);
      const url = params.detection.entities?.url || candidateUrls[0];
      return url || candidateUrls.length ? { url, candidateUrls } : null;
    }
    case 'search-knowledge':
      return { query: params.userInput, maxSnippets: 5 };
    default:
      return null;
  }
};
