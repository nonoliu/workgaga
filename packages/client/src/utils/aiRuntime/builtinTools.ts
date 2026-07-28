import { documentDir } from '@tauri-apps/api/path';
import { mkdir, readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { retrieveAIKnowledgeSnippets } from '../aiKnowledgeRetrieval';
import { llmFetch } from '../llmHttpClient';
import { assertSafePublicUrl } from './security';
import { useDashboardStore } from '../../store/modal/dashboard';
import { useFileStore } from '../../store/modal/file';
import { useKnowledgeGraphStore } from '../../store/modal/knowledgeGraph';
import { buildTodayWorkReportBrief, collectTodayWorkActivities } from './workActivity/reportMvp';
import { developerAITools } from './developerTools';
import type { AIToolDefinition } from './tools';
import { getWebSearchProviders, type WebSearchProviderAttempt, type WebSearchQueryAttempt } from './webSearchProviders';
import { isAbsoluteWorkspacePath, joinWorkspacePath, resolveWorkspacePath } from './workspace';
import type { KnowledgeNote } from '../../components/types';
import type { ScheduleItem, TodoItem } from '../../store/modal/dashboard';

const MAX_WEB_FETCH_CHARS = 20_000;
const DEFAULT_FETCH_TIMEOUT_MS = 45_000;

const textInput = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const todayKey = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const stripHtmlToText = (html: string): string =>
  html
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

const truncateToolText = (content: string, maxChars = MAX_WEB_FETCH_CHARS): string =>
  content.length > maxChars
    ? `${content.slice(0, maxChars)}\n\n[内容已截断，原始长度 ${content.length} 字符]`
    : content;

const validateObject = <TInput>(
  input: unknown,
  build: (record: Record<string, unknown>) => TInput | string,
): { ok: boolean; input?: TInput; message?: string } => {
  if (!input || typeof input !== 'object') return { ok: false, message: '工具参数必须是对象。' };
  const result = build(input as Record<string, unknown>);
  if (typeof result === 'string') return { ok: false, message: result };
  return { ok: true, input: result };
};

export interface WebFetchInput {
  url?: string;
  candidateUrls?: string[];
  maxChars?: number;
}

export const webFetchTool: AIToolDefinition<WebFetchInput> = {
  name: 'web-fetch',
  title: '读取网页',
  description:
    'Fetch a public web page URL and return readable text content. Use this when the user provides a URL or asks to inspect a specific page.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The fully-qualified URL to fetch.' },
      candidateUrls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Fallback URLs to try when url fails or is unavailable.',
      },
      maxChars: { type: 'number', description: 'Maximum returned text characters.' },
    },
    required: [],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<WebFetchInput>(input, (record) => {
      const url = textInput(record.url);
      const candidateUrls = Array.isArray(record.candidateUrls)
        ? record.candidateUrls
            .map((item) => textInput(item))
            .filter(Boolean)
            .slice(0, 5)
        : [];
      const urls = Array.from(new Set([url, ...candidateUrls].filter(Boolean)));
      if (!urls.length) return '缺少 url 或 candidateUrls。';
      for (const candidate of urls) {
        try {
          assertSafePublicUrl(candidate);
        } catch (error) {
          return error instanceof Error ? error.message : `URL 无效：${candidate}`;
        }
      }
      const maxChars =
        typeof record.maxChars === 'number' && Number.isFinite(record.maxChars)
          ? Math.max(1000, Math.min(50_000, Math.floor(record.maxChars)))
          : undefined;
      return { url: url || undefined, candidateUrls, maxChars };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: 'Phase 2 暂时默认允许只读网页抓取；Phase 3 将接入 domain 权限。' };
  },
  async call(input, _context, onProgress) {
    const urls = Array.from(new Set([input.url, ...(input.candidateUrls ?? [])].filter(Boolean))) as string[];
    const attempts: Array<{ url: string; status?: number; ok: boolean; error?: string }> = [];

    for (const url of urls) {
      onProgress({ message: `正在读取网页：${url}` });
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);
      try {
        const response = await llmFetch(url, { method: 'GET', signal: controller.signal });
        const contentType = response.headers.get('content-type') || '';
        const raw = await response.text();
        const text = contentType.includes('text/html') ? stripHtmlToText(raw) : raw.trim();
        attempts.push({ url, status: response.status, ok: response.ok });
        if (response.ok && text.trim()) {
          return {
            url,
            status: response.status,
            ok: response.ok,
            contentType,
            attempts,
            content: truncateToolText(text, input.maxChars),
          };
        }
      } catch (error) {
        attempts.push({ url, ok: false, error: error instanceof Error ? error.message : String(error) });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    return {
      url: urls[0],
      status: attempts[attempts.length - 1]?.status ?? 0,
      ok: false,
      contentType: '',
      attempts,
      content: '',
    };
  },
};

export interface WebSearchInput {
  query: string;
  alternateQueries?: string[];
  domainHints?: string[];
  maxResults?: number;
}

export const webSearchTool: AIToolDefinition<WebSearchInput> = {
  name: 'web-search',
  title: '联网搜索',
  description:
    'Search the web for up-to-date information. Use this for current events, recent documentation, or information beyond model knowledge.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The web search query.' },
      alternateQueries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Fallback queries to try when the primary query returns no usable results.',
      },
      domainHints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Domains or source names to append to fallback searches.',
      },
      maxResults: { type: 'number', description: 'Maximum returned results.' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<WebSearchInput>(input, (record) => {
      const query = textInput(record.query);
      if (query.length < 2) return '搜索关键词太短。';
      const alternateQueries = Array.isArray(record.alternateQueries)
        ? record.alternateQueries
            .map((item) => textInput(item))
            .filter((item) => item.length >= 2)
            .slice(0, 5)
        : undefined;
      const domainHints = Array.isArray(record.domainHints)
        ? record.domainHints
            .map((item) => textInput(item))
            .filter(Boolean)
            .slice(0, 5)
        : undefined;
      const maxResults =
        typeof record.maxResults === 'number' && Number.isFinite(record.maxResults)
          ? Math.max(1, Math.min(10, Math.floor(record.maxResults)))
          : undefined;
      return { query, alternateQueries, domainHints, maxResults };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '联网搜索为只读工具。' };
  },
  async call(input, _context, onProgress) {
    const providers = getWebSearchProviders();
    const queries = Array.from(
      new Set(
        [
          input.query,
          ...(input.alternateQueries ?? []),
          ...(input.domainHints ?? []).map((hint) => `${input.query} ${hint}`),
        ]
          .map((query) => query.trim())
          .filter(Boolean),
      ),
    ).slice(0, 8);
    const attempts: WebSearchQueryAttempt[] = [];
    const providerAttempts: WebSearchProviderAttempt[] = [];

    for (const query of queries) {
      for (const provider of providers) {
        onProgress({ message: `正在联网搜索：${query} (${provider.name})` });
        try {
          const response = await provider.search({
            query,
            maxResults: input.maxResults ?? 8,
          });
          attempts.push({
            query,
            providerId: response.providerId,
            providerName: response.providerName,
            results: response.results,
          });
          providerAttempts.push({
            providerId: response.providerId,
            providerName: response.providerName,
            query,
            ok: response.results.length > 0,
            resultCount: response.results.length,
          });
          if (response.results.length > 0) {
            return {
              query: input.query,
              source: response.providerName,
              sourceProviderId: response.providerId,
              usedQuery: query,
              attempts,
              providerAttempts,
              results: response.results,
            };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          attempts.push({
            query,
            providerId: provider.id,
            providerName: provider.name,
            results: [],
            error: message,
          });
          providerAttempts.push({
            providerId: provider.id,
            providerName: provider.name,
            query,
            ok: false,
            resultCount: 0,
            error: message,
          });
        }
      }
    }

    return {
      query: input.query,
      source: providers[0]?.name || 'unknown',
      sourceProviderId: providers[0]?.id,
      usedQuery: queries[0] || input.query,
      attempts,
      providerAttempts,
      results: [],
    };
  },
};

export interface WeatherForecastInput {
  city: string;
  days?: number;
}

export const weatherForecastTool: AIToolDefinition<WeatherForecastInput> = {
  name: 'weather-forecast',
  title: '天气预报',
  description: 'Get recent weather forecast for a city. Use this for weather questions such as “杭州最近3天天气”.',
  inputSchema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name, e.g. Hangzhou or 杭州.' },
      days: { type: 'number', description: 'Forecast days, 1-3.' },
    },
    required: ['city'],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<WeatherForecastInput>(input, (record) => {
      const city = textInput(record.city);
      if (!city) return '缺少 city。';
      const days = typeof record.days === 'number' ? Math.max(1, Math.min(3, Math.floor(record.days))) : 3;
      return { city, days };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '天气查询为公网只读工具。' };
  },
  async call(input, _context, onProgress) {
    onProgress({ message: `正在查询 ${input.city} 最近 ${input.days ?? 3} 天天气...` });
    const days = input.days ?? 3;
    const wttrUrl = `https://wttr.in/${encodeURIComponent(input.city)}?format=j1&lang=zh`;
    try {
      const response = await llmFetch(wttrUrl, { method: 'GET' });
      if (!response.ok) throw new Error(`天气接口返回 ${response.status}`);
      const data = (await response.json()) as {
        nearest_area?: Array<{ areaName?: Array<{ value?: string }> }>;
        weather?: Array<{
          date?: string;
          avgtempC?: string;
          maxtempC?: string;
          mintempC?: string;
          hourly?: Array<{
            weatherDesc?: Array<{ value?: string }>;
            windspeedKmph?: string;
            winddir16Point?: string;
            chanceofrain?: string;
          }>;
        }>;
      };
      return {
        city: input.city,
        resolvedArea: data.nearest_area?.[0]?.areaName?.[0]?.value || input.city,
        days: (data.weather ?? []).slice(0, days).map((day) => {
          const noon = day.hourly?.[4] || day.hourly?.[0];
          return {
            date: day.date,
            weather: noon?.weatherDesc?.[0]?.value || '-',
            minTempC: day.mintempC,
            maxTempC: day.maxtempC,
            avgTempC: day.avgtempC,
            wind: `${noon?.winddir16Point || '-'} ${noon?.windspeedKmph || '-'}km/h`,
            chanceOfRain: noon?.chanceofrain ? `${noon.chanceofrain}%` : '-',
          };
        }),
        source: 'wttr.in',
      };
    } catch (wttrError) {
      onProgress({ message: '主天气源失败，正在尝试 Open-Meteo fallback...' });
      const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input.city)}&count=1&language=zh&format=json`;
      const geocodeResponse = await llmFetch(geocodeUrl, { method: 'GET' });
      if (!geocodeResponse.ok) throw wttrError instanceof Error ? wttrError : new Error(String(wttrError));
      const geocode = (await geocodeResponse.json()) as {
        results?: Array<{ name?: string; latitude?: number; longitude?: number; country?: string; admin1?: string }>;
      };
      const location = geocode.results?.[0];
      if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
        throw wttrError instanceof Error ? wttrError : new Error(String(wttrError));
      }
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=${days}`;
      const forecastResponse = await llmFetch(forecastUrl, { method: 'GET' });
      if (!forecastResponse.ok) throw new Error(`Open-Meteo 天气接口返回 ${forecastResponse.status}`);
      const forecast = (await forecastResponse.json()) as {
        daily?: {
          time?: string[];
          weather_code?: number[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          precipitation_probability_max?: number[];
        };
      };
      const weatherText = (code?: number): string => {
        if (code === undefined) return '-';
        if (code === 0) return '晴';
        if ([1, 2, 3].includes(code)) return '多云';
        if ([45, 48].includes(code)) return '雾';
        if ([51, 53, 55, 56, 57].includes(code)) return '毛毛雨';
        if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '雨';
        if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪';
        if ([95, 96, 99].includes(code)) return '雷暴';
        return `天气代码 ${code}`;
      };
      const times = forecast.daily?.time ?? [];
      return {
        city: input.city,
        resolvedArea: [location.name, location.admin1, location.country].filter(Boolean).join(', ') || input.city,
        days: times.slice(0, days).map((date, index) => ({
          date,
          weather: weatherText(forecast.daily?.weather_code?.[index]),
          minTempC: forecast.daily?.temperature_2m_min?.[index]?.toString() ?? '-',
          maxTempC: forecast.daily?.temperature_2m_max?.[index]?.toString() ?? '-',
          avgTempC: '-',
          wind: '-',
          chanceOfRain:
            forecast.daily?.precipitation_probability_max?.[index] !== undefined
              ? `${forecast.daily.precipitation_probability_max[index]}%`
              : '-',
        })),
        source: 'Open-Meteo',
        fallbackOf: 'wttr.in',
      };
    }
  },
};

export interface SearchKnowledgeInput {
  query: string;
  maxSnippets?: number;
}

export const searchKnowledgeTool: AIToolDefinition<SearchKnowledgeInput> = {
  name: 'search-knowledge',
  title: '检索知识库',
  description: 'Search the current local knowledge base and return relevant snippets with source paths.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query.' },
      maxSnippets: { type: 'number', description: 'Maximum snippets to return.' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<SearchKnowledgeInput>(input, (record) => {
      const query = textInput(record.query);
      if (!query) return '缺少 query。';
      const maxSnippets =
        typeof record.maxSnippets === 'number' ? Math.max(1, Math.min(10, Math.floor(record.maxSnippets))) : 5;
      return { query, maxSnippets };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '知识库检索为本地只读工具。' };
  },
  async call(input) {
    const knowledgeGraphStore = useKnowledgeGraphStore();
    const notes = knowledgeGraphStore.graphData?.notes ?? [];
    return {
      query: input.query,
      vaultPath: knowledgeGraphStore.vaultPath,
      snippets: retrieveAIKnowledgeSnippets(input.query, notes, { maxSnippets: input.maxSnippets }),
    };
  },
};

export interface ListTodosInput {
  plannedDate?: string;
  completedOn?: string;
  status?: 'all' | 'pending' | 'completed';
  maxItems?: number;
}

export const listTodosTool: AIToolDefinition<ListTodosInput> = {
  name: 'list-todos',
  title: '列出待办',
  description: 'List todo items from the local dashboard store with optional filters.',
  inputSchema: {
    type: 'object',
    properties: {
      plannedDate: { type: 'string', description: 'Filter by plannedDate (YYYY-MM-DD). Defaults to today.' },
      completedOn: { type: 'string', description: 'Filter todos completed on date (YYYY-MM-DD).' },
      status: { type: 'string', enum: ['all', 'pending', 'completed'], description: 'Todo completion status filter.' },
      maxItems: { type: 'number', description: 'Max todos to return (1-200).' },
    },
    required: [],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<ListTodosInput>(input, (record) => {
      const plannedDate = textInput(record.plannedDate) || todayKey();
      const completedOn = textInput(record.completedOn) || undefined;
      const status = ['all', 'pending', 'completed'].includes(String(record.status))
        ? (record.status as ListTodosInput['status'])
        : 'all';
      const maxItems =
        typeof record.maxItems === 'number' && Number.isFinite(record.maxItems)
          ? Math.max(1, Math.min(200, Math.floor(record.maxItems)))
          : 100;

      if (plannedDate && !/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) return 'plannedDate 必须是 YYYY-MM-DD。';
      if (completedOn && !/^\d{4}-\d{2}-\d{2}$/.test(completedOn)) return 'completedOn 必须是 YYYY-MM-DD。';

      return { plannedDate, completedOn, status, maxItems };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '待办查询为本地只读工具。' };
  },
  async call(input) {
    const dashboardStore = useDashboardStore();
    const todos = dashboardStore.todos as TodoItem[];
    const plannedDate = input.plannedDate || todayKey();

    const matchesCompletedOn = (todo: TodoItem): boolean => {
      if (!input.completedOn) return true;
      if (!todo.completed) return false;
      if (typeof todo.completedAt !== 'number') return false;
      const date = new Date(todo.completedAt);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}` === input.completedOn;
    };

    const filtered = todos
      .filter((todo) => todo.plannedDate === plannedDate)
      .filter((todo) => {
        if (input.status === 'pending') return !todo.completed;
        if (input.status === 'completed') return todo.completed;
        return true;
      })
      .filter(matchesCompletedOn)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, input.maxItems ?? 100)
      .map((todo) => ({
        id: todo.id,
        content: todo.content,
        completed: todo.completed,
        plannedDate: todo.plannedDate,
        priority: todo.priority ?? 'medium',
        scene: todo.scene,
        tags: todo.tags ?? [],
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
        completedAt: todo.completedAt,
        scheduleId: todo.scheduleId,
        linkedDocuments: todo.linkedDocuments ?? [],
      }));

    return {
      source: 'dashboard_state',
      plannedDate,
      completedOn: input.completedOn,
      status: input.status ?? 'all',
      total: filtered.length,
      items: filtered,
    };
  },
};

export interface GetTodoInput {
  id: string;
}

export const getTodoTool: AIToolDefinition<GetTodoInput> = {
  name: 'get-todo',
  title: '读取待办',
  description: 'Get a single todo item from the local dashboard store by id.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Todo id.' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<GetTodoInput>(input, (record) => {
      const id = textInput(record.id);
      if (!id) return '缺少 id。';
      return { id };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '待办查询为本地只读工具。' };
  },
  async call(input) {
    const dashboardStore = useDashboardStore();
    const todo = (dashboardStore.todos as TodoItem[]).find((item) => item.id === input.id) ?? null;
    if (!todo) return { source: 'dashboard_state', found: false, todo: null };
    return {
      source: 'dashboard_state',
      found: true,
      todo: {
        id: todo.id,
        content: todo.content,
        completed: todo.completed,
        plannedDate: todo.plannedDate,
        priority: todo.priority ?? 'medium',
        scene: todo.scene,
        tags: todo.tags ?? [],
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
        completedAt: todo.completedAt,
        scheduleId: todo.scheduleId,
        linkedDocuments: todo.linkedDocuments ?? [],
      },
    };
  },
};

export interface ListSchedulesInput {
  date?: string;
  from?: string;
  to?: string;
  maxItems?: number;
}

export const listSchedulesTool: AIToolDefinition<ListSchedulesInput> = {
  name: 'list-schedules',
  title: '列出日程',
  description: 'List schedule items from the local dashboard store with optional date filters.',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Filter by date (YYYY-MM-DD). Defaults to today when no range given.' },
      from: { type: 'string', description: 'Range start date (YYYY-MM-DD).' },
      to: { type: 'string', description: 'Range end date (YYYY-MM-DD).' },
      maxItems: { type: 'number', description: 'Max schedules to return (1-200).' },
    },
    required: [],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<ListSchedulesInput>(input, (record) => {
      const date = textInput(record.date) || undefined;
      const from = textInput(record.from) || undefined;
      const to = textInput(record.to) || undefined;
      const maxItems =
        typeof record.maxItems === 'number' && Number.isFinite(record.maxItems)
          ? Math.max(1, Math.min(200, Math.floor(record.maxItems)))
          : 100;

      const checkDateKey = (value: string, field: string): string | undefined =>
        /^\d{4}-\d{2}-\d{2}$/.test(value) ? undefined : `${field} 必须是 YYYY-MM-DD。`;
      if (date) {
        const error = checkDateKey(date, 'date');
        if (error) return error;
      }
      if (from) {
        const error = checkDateKey(from, 'from');
        if (error) return error;
      }
      if (to) {
        const error = checkDateKey(to, 'to');
        if (error) return error;
      }

      return { date, from, to, maxItems };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '日程查询为本地只读工具。' };
  },
  async call(input) {
    const dashboardStore = useDashboardStore();
    const schedules = dashboardStore.schedules as ScheduleItem[];
    const maxItems = input.maxItems ?? 100;
    const today = todayKey();

    const date = input.date || (!input.from && !input.to ? today : undefined);
    const from = input.from;
    const to = input.to;

    const filtered = schedules
      .filter((schedule) => {
        if (date) return schedule.date === date;
        if (from && schedule.date < from) return false;
        if (to && schedule.date > to) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.startTime || '').localeCompare(b.startTime || '');
      })
      .slice(0, maxItems)
      .map((schedule) => ({
        id: schedule.id,
        title: schedule.title,
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        description: schedule.description,
        linkedDocuments: schedule.linkedDocuments ?? [],
      }));

    return {
      source: 'dashboard_state',
      date,
      from,
      to,
      total: filtered.length,
      items: filtered,
    };
  },
};

export interface GetScheduleInput {
  id: string;
}

export const getScheduleTool: AIToolDefinition<GetScheduleInput> = {
  name: 'get-schedule',
  title: '读取日程',
  description: 'Get a single schedule item from the local dashboard store by id.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Schedule id.' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<GetScheduleInput>(input, (record) => {
      const id = textInput(record.id);
      if (!id) return '缺少 id。';
      return { id };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '日程查询为本地只读工具。' };
  },
  async call(input) {
    const dashboardStore = useDashboardStore();
    const schedule = (dashboardStore.schedules as ScheduleItem[]).find((item) => item.id === input.id) ?? null;
    if (!schedule) return { source: 'dashboard_state', found: false, schedule: null };
    return {
      source: 'dashboard_state',
      found: true,
      schedule: {
        id: schedule.id,
        title: schedule.title,
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        description: schedule.description,
        linkedDocuments: schedule.linkedDocuments ?? [],
      },
    };
  },
};

export interface ListKnowledgeNotesInput {
  query?: string;
  maxItems?: number;
}

export const listKnowledgeNotesTool: AIToolDefinition<ListKnowledgeNotesInput> = {
  name: 'list-knowledge-notes',
  title: '列出知识库文档',
  description: 'List indexed knowledge notes (markdown) in the current vault, optionally filtered by query.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional filter by title/path.' },
      maxItems: { type: 'number', description: 'Max notes to return (1-200).' },
    },
    required: [],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<ListKnowledgeNotesInput>(input, (record) => {
      const query = textInput(record.query) || undefined;
      const maxItems =
        typeof record.maxItems === 'number' && Number.isFinite(record.maxItems)
          ? Math.max(1, Math.min(200, Math.floor(record.maxItems)))
          : 100;
      return { query, maxItems };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '知识库索引查询为本地只读工具。' };
  },
  async call(input) {
    const knowledgeGraphStore = useKnowledgeGraphStore();
    const notes = (knowledgeGraphStore.graphData?.notes ?? []) as KnowledgeNote[];
    const query = (input.query ?? '').trim().toLowerCase();
    const filtered = notes
      .filter((note) => {
        if (!query) return true;
        return note.title.toLowerCase().includes(query) || note.relativePath.toLowerCase().includes(query);
      })
      .slice(0, input.maxItems ?? 100)
      .map((note) => ({
        id: note.id,
        title: note.title,
        relativePath: note.relativePath,
        path: note.path,
        contentLength: note.content.length,
      }));

    return {
      source: 'knowledge_index',
      vaultPath: knowledgeGraphStore.vaultPath,
      indexedAt: knowledgeGraphStore.graphData?.indexedAt ?? null,
      total: filtered.length,
      items: filtered,
    };
  },
};

export interface ReadKnowledgeNoteInput {
  id?: string;
  relativePath?: string;
  maxChars?: number;
}

export const readKnowledgeNoteTool: AIToolDefinition<ReadKnowledgeNoteInput> = {
  name: 'read-knowledge-note',
  title: '读取知识库文档',
  description: 'Read an indexed knowledge note content by note id or relativePath.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Knowledge note id.' },
      relativePath: { type: 'string', description: 'Knowledge note relative path.' },
      maxChars: { type: 'number', description: 'Max chars to return (1000-50000).' },
    },
    required: [],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<ReadKnowledgeNoteInput>(input, (record) => {
      const id = textInput(record.id) || undefined;
      const relativePath = textInput(record.relativePath) || undefined;
      if (!id && !relativePath) return '缺少 id 或 relativePath。';
      const maxChars =
        typeof record.maxChars === 'number' && Number.isFinite(record.maxChars)
          ? Math.max(1000, Math.min(50_000, Math.floor(record.maxChars)))
          : 20_000;
      return { id, relativePath, maxChars };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '知识库文档读取为本地只读工具。' };
  },
  async call(input) {
    const knowledgeGraphStore = useKnowledgeGraphStore();
    const notes = (knowledgeGraphStore.graphData?.notes ?? []) as KnowledgeNote[];
    const note = input.id
      ? notes.find((item) => item.id === input.id)
      : notes.find((item) => item.relativePath === input.relativePath);

    if (!note) {
      return {
        source: 'knowledge_index',
        found: false,
        vaultPath: knowledgeGraphStore.vaultPath,
        indexedAt: knowledgeGraphStore.graphData?.indexedAt ?? null,
        note: null,
      };
    }

    return {
      source: 'knowledge_index',
      found: true,
      vaultPath: knowledgeGraphStore.vaultPath,
      indexedAt: knowledgeGraphStore.graphData?.indexedAt ?? null,
      note: {
        id: note.id,
        title: note.title,
        relativePath: note.relativePath,
        path: note.path,
        content: truncateToolText(note.content, input.maxChars),
        contentLength: note.content.length,
      },
    };
  },
};

const MAX_REPORT_SCAN_DEPTH = 5;
const MAX_REPORT_FILE_CHARS = 40_000;
const REPORT_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.obsidian',
  'dist',
  'target',
  '.workgaga',
  '.idea',
  '.vscode',
]);

const joinPath = (base: string, name: string): string => `${base.replace(/[\\/]+$/, '')}/${name}`;
const normalizeFsPath = (path: string): string => path.replace(/\\/g, '/');
const dirname = (path: string): string => {
  const normalized = normalizeFsPath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
};

const isUnderRoot = (path: string, root: string): boolean => {
  const normalizedPath = normalizeFsPath(path);
  const normalizedRoot = normalizeFsPath(root).replace(/[\\/]+$/, '');
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
};

const isMarkdownFile = (path: string): boolean => /\.(md|markdown)$/i.test(path);

const isLikelyTaskFile = (name: string): boolean =>
  /^(todo|todos|task|tasks)\.(md|markdown)$/i.test(name) || /^(todo|todos|task|tasks)$/i.test(name);

export interface MarkdownTaskItem {
  filePath: string;
  relativePath?: string;
  line: number;
  checked: boolean;
  text: string;
  matchedDate: boolean;
}

const buildDateVariants = (dateKey: string): string[] => {
  const [year, month, day] = dateKey.split('-');
  const monthNumber = String(Number(month));
  const dayNumber = String(Number(day));
  return [
    dateKey,
    `${year}/${month}/${day}`,
    `${year}/${monthNumber}/${dayNumber}`,
    `${monthNumber}月${dayNumber}日`,
    `${year}年${monthNumber}月${dayNumber}日`,
  ].filter(Boolean);
};

const extractMarkdownTasks = (params: {
  content: string;
  filePath: string;
  relativePath?: string;
  dateKey: string;
}): MarkdownTaskItem[] => {
  const dateVariants = buildDateVariants(params.dateKey);
  const matchedDate = dateVariants.some(
    (variant) =>
      params.filePath.includes(variant) || params.relativePath?.includes(variant) || params.content.includes(variant),
  );
  const tasks: MarkdownTaskItem[] = [];
  const lines = params.content.split('\n');

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const checkboxMatch = line.match(/^[-*]\s*\[( |x|X)\]\s+(.*)$/);
    if (checkboxMatch) {
      tasks.push({
        filePath: params.filePath,
        relativePath: params.relativePath,
        line: index + 1,
        checked: checkboxMatch[1].toLowerCase() === 'x',
        text: checkboxMatch[2].trim(),
        matchedDate,
      });
      return;
    }
    const todoMatch = line.match(/^(?:todo|TODO|Todo)[:：]\s*(.+)$/);
    if (todoMatch) {
      tasks.push({
        filePath: params.filePath,
        relativePath: params.relativePath,
        line: index + 1,
        checked: false,
        text: todoMatch[1].trim(),
        matchedDate,
      });
    }
  });

  return tasks;
};

const readFileWithLimit = async (path: string): Promise<string> => {
  const raw = await readTextFile(path);
  return raw.length > MAX_REPORT_FILE_CHARS ? raw.slice(0, MAX_REPORT_FILE_CHARS) : raw;
};

const walkMarkdownFiles = async (params: {
  root: string;
  maxDepth: number;
  maxFiles: number;
}): Promise<Array<{ path: string; relativePath: string; name: string }>> => {
  const root = normalizeFsPath(params.root).replace(/[\\/]+$/, '');
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  const files: Array<{ path: string; relativePath: string; name: string }> = [];

  while (queue.length && files.length < params.maxFiles) {
    const current = queue.shift()!;
    if (current.depth > params.maxDepth) continue;
    let entries: Array<{ name?: string; isDirectory?: boolean; isFile?: boolean }>;
    try {
      entries = (await readDir(current.dir)) as Array<{ name?: string; isDirectory?: boolean; isFile?: boolean }>;
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files.length >= params.maxFiles) break;
      const name = entry.name || '';
      if (!name) continue;
      if (entry.isDirectory) {
        if (REPORT_EXCLUDED_DIRECTORIES.has(name)) continue;
        queue.push({ dir: joinPath(current.dir, name), depth: current.depth + 1 });
        continue;
      }
      const path = joinPath(current.dir, name);
      if (!isMarkdownFile(path) && !isLikelyTaskFile(name)) continue;
      const relativePath = normalizeFsPath(path).startsWith(`${root}/`)
        ? normalizeFsPath(path).slice(root.length + 1)
        : name;
      files.push({ path, relativePath, name });
    }
  }

  return files.slice(0, params.maxFiles);
};

export interface DailyReportCollectedContext {
  date: string;
  sources: {
    dashboard: boolean;
    knowledgeVaultPath?: string;
    workspaceRoot?: string;
    recentFiles: Array<{ path: string; name: string; lastAccessed?: number }>;
  };
  dashboard: {
    plannedTodos: Array<Record<string, unknown>>;
    completedTodos: Array<Record<string, unknown>>;
    updatedTodos: Array<Record<string, unknown>>;
    schedules: Array<Record<string, unknown>>;
  };
  knowledge: {
    refreshed: boolean;
    refreshError?: string;
    vaultPath?: string;
    indexedAt?: number | null;
    noteCount: number;
    snippets: DailyReportKnowledgeSnippet[];
    extractedTasks: MarkdownTaskItem[];
  };
  workspace: {
    scannedFiles: Array<{ path: string; relativePath?: string; source: 'vault' | 'workspace' | 'recent' }>;
    tasks: {
      matchedDate: MarkdownTaskItem[];
      others: MarkdownTaskItem[];
    };
  };
}

interface DailyBriefItem {
  text: string;
  source: string;
}

interface DailyReportKnowledgeSnippet {
  title: string;
  path?: string;
  content: string;
}

export interface DailyReportBrief {
  date: string;
  summary: {
    completedCount: number;
    inProgressCount: number;
    meetingCount: number;
    riskCount: number;
    tomorrowCount: number;
    sourceCount: number;
  };
  sections: {
    completed: DailyBriefItem[];
    inProgress: DailyBriefItem[];
    meetings: DailyBriefItem[];
    risks: DailyBriefItem[];
    tomorrowPlan: DailyBriefItem[];
  };
  evidenceSources: string[];
  reportMarkdown: string;
  guidance: string[];
}

export interface CollectDailyReportContextInput {
  date?: string;
  query?: string;
  maxItems?: number;
  maxFiles?: number;
  refreshKnowledgeIndex?: boolean;
}

const createTodoBriefText = (todo: Record<string, unknown>, prefix?: string): string => {
  const content = typeof todo.content === 'string' ? todo.content.trim() : '';
  const priority = typeof todo.priority === 'string' ? todo.priority : undefined;
  const linkedDocuments = Array.isArray(todo.linkedDocuments)
    ? todo.linkedDocuments.filter((item) => typeof item === 'string')
    : [];
  const linkedSuffix = linkedDocuments.length ? `（关联文档：${linkedDocuments.slice(0, 2).join('、')}）` : '';
  const prioritySuffix = priority ? ` [${priority}]` : '';
  return `${prefix ? `${prefix} ` : ''}${content}${prioritySuffix}${linkedSuffix}`.trim();
};

const createScheduleBriefText = (schedule: Record<string, unknown>): string => {
  const title = typeof schedule.title === 'string' ? schedule.title.trim() : '未命名日程';
  const start = typeof schedule.startTime === 'string' && schedule.startTime ? schedule.startTime : '';
  const end = typeof schedule.endTime === 'string' && schedule.endTime ? schedule.endTime : '';
  const time = start || end ? `${start || '?'}-${end || '?'}` : '时间未填写';
  const description =
    typeof schedule.description === 'string' && schedule.description.trim() ? `：${schedule.description.trim()}` : '';
  return `${time} ${title}${description}`.trim();
};

const normalizeSnippetText = (snippet: DailyReportKnowledgeSnippet): string =>
  snippet.content.replace(/\s+/g, ' ').trim().slice(0, 160);

const addBriefItem = (
  bucket: DailyBriefItem[],
  seen: Set<string>,
  text: string,
  source: string,
  maxItems: number,
): void => {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (!normalizedText || bucket.length >= maxItems) return;
  const key = `${normalizedText}@@${source}`;
  if (seen.has(key)) return;
  seen.add(key);
  bucket.push({ text: normalizedText, source });
};

const looksLikeRisk = (text: string): boolean => /阻塞|风险|问题|异常|失败|待确认|卡住|延期|依赖|bug|报错/i.test(text);
const looksLikeMeeting = (text: string): boolean => /会议|沟通|同步|评审|讨论|纪要|对齐/i.test(text);

const formatBriefSection = (title: string, items: DailyBriefItem[]): string[] => {
  if (!items.length) return [`## ${title}`, '- 暂无明确记录'];
  return [`## ${title}`, ...items.map((item) => `- ${item.text}`)];
};

const collectDailyReportContextData = async (
  input: CollectDailyReportContextInput,
  context: Parameters<AIToolDefinition<CollectDailyReportContextInput>['call']>[1],
  onProgress: Parameters<AIToolDefinition<CollectDailyReportContextInput>['call']>[2],
): Promise<DailyReportCollectedContext> => {
  const dateKey = input.date || todayKey();
  const maxItems = input.maxItems ?? 50;
  const fileStore = useFileStore();
  const dashboardStore = useDashboardStore();
  const knowledgeGraphStore = useKnowledgeGraphStore();

  const completedOn = dateKey;
  const plannedDate = dateKey;

  const plannedTodos = (dashboardStore.todos as TodoItem[])
    .filter((todo) => todo.plannedDate === plannedDate)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxItems)
    .map((todo) => ({
      id: todo.id,
      content: todo.content,
      completed: todo.completed,
      plannedDate: todo.plannedDate,
      priority: todo.priority ?? 'medium',
      scheduleId: todo.scheduleId,
      linkedDocuments: todo.linkedDocuments ?? [],
    }));

  const completedTodos = (dashboardStore.todos as TodoItem[])
    .filter((todo) => todo.completed && typeof todo.completedAt === 'number')
    .filter((todo) => {
      const date = new Date(todo.completedAt as number);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}` === completedOn;
    })
    .sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt))
    .slice(0, maxItems)
    .map((todo) => ({
      id: todo.id,
      content: todo.content,
      completed: todo.completed,
      plannedDate: todo.plannedDate,
      priority: todo.priority ?? 'medium',
      scheduleId: todo.scheduleId,
      linkedDocuments: todo.linkedDocuments ?? [],
    }));

  const updatedTodos = (dashboardStore.todos as TodoItem[])
    .filter((todo) => {
      const date = new Date(todo.updatedAt);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}` === dateKey;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, maxItems)
    .map((todo) => ({
      id: todo.id,
      content: todo.content,
      completed: todo.completed,
      plannedDate: todo.plannedDate,
      priority: todo.priority ?? 'medium',
      scheduleId: todo.scheduleId,
      linkedDocuments: todo.linkedDocuments ?? [],
    }));

  const schedules = (dashboardStore.schedules as ScheduleItem[])
    .filter((schedule) => schedule.date === dateKey)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
    .slice(0, maxItems)
    .map((schedule) => ({
      id: schedule.id,
      title: schedule.title,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      description: schedule.description,
      linkedDocuments: schedule.linkedDocuments ?? [],
    }));

  let vaultIndexed = false;
  let vaultIndexError: string | undefined;
  if (input.refreshKnowledgeIndex && knowledgeGraphStore.vaultPath) {
    onProgress({ message: '正在刷新知识库索引...' });
    try {
      await knowledgeGraphStore.refresh();
      vaultIndexed = true;
    } catch (error) {
      vaultIndexError = error instanceof Error ? error.message : String(error);
    }
  }

  const notes = (knowledgeGraphStore.graphData?.notes ?? []) as KnowledgeNote[];
  const defaultQuery = input.query || `${dateKey} 日报 工作 会议 记录 待办 完成 进展 问题 明日计划`;
  const knowledgeSnippets = retrieveAIKnowledgeSnippets(defaultQuery, notes, { maxSnippets: Math.min(10, maxItems) });

  const knowledgeTasks = notes
    .slice(0, Math.min(80, notes.length))
    .flatMap((note) =>
      extractMarkdownTasks({
        content: note.content,
        filePath: note.path,
        relativePath: note.relativePath,
        dateKey,
      }),
    )
    .slice(0, maxItems);

  const recentFiles = fileStore.sortedRecentFiles.slice(0, 12);
  const rootCandidates = [
    knowledgeGraphStore.vaultPath || undefined,
    context.workspace?.workingDirectory || undefined,
    fileStore.currentFilePath ? dirname(fileStore.currentFilePath) : undefined,
    ...recentFiles.map((file) => (file.path ? dirname(file.path) : undefined)),
  ]
    .filter(Boolean)
    .filter((path, index, list) => list.indexOf(path) === index) as string[];
  const scanRoots = rootCandidates.slice(0, 8);
  const isUnderAnyRoot = (path: string): boolean => scanRoots.some((root) => isUnderRoot(path, root));
  const safeRecentFiles = recentFiles.filter((file) => isMarkdownFile(file.path) && isUnderAnyRoot(file.path));

  const markdownTasksFromFiles: MarkdownTaskItem[] = [];
  const scannedFiles: Array<{ path: string; relativePath?: string; source: 'vault' | 'workspace' | 'recent' }> = [];
  const maxFiles = input.maxFiles ?? 180;

  onProgress({ message: '正在扫描本地 Markdown 任务文件...' });
  for (const root of scanRoots) {
    if (markdownTasksFromFiles.length >= maxItems) break;
    const source =
      knowledgeGraphStore.vaultPath && normalizeFsPath(root) === normalizeFsPath(knowledgeGraphStore.vaultPath)
        ? 'vault'
        : 'workspace';
    const files = await walkMarkdownFiles({ root, maxDepth: MAX_REPORT_SCAN_DEPTH, maxFiles });
    for (const file of files) {
      if (markdownTasksFromFiles.length >= maxItems) break;
      if (scannedFiles.length >= maxFiles) break;
      scannedFiles.push({ path: file.path, relativePath: file.relativePath, source });
      try {
        const content = await readFileWithLimit(file.path);
        const items = extractMarkdownTasks({
          content,
          filePath: file.path,
          relativePath: file.relativePath,
          dateKey,
        });
        markdownTasksFromFiles.push(...items);
      } catch {
        continue;
      }
    }
  }

  for (const file of safeRecentFiles) {
    if (markdownTasksFromFiles.length >= maxItems) break;
    if (scannedFiles.length >= maxFiles) break;
    scannedFiles.push({ path: file.path, source: 'recent' });
    try {
      const content = await readFileWithLimit(file.path);
      markdownTasksFromFiles.push(
        ...extractMarkdownTasks({
          content,
          filePath: file.path,
          dateKey,
        }),
      );
    } catch {
      continue;
    }
  }

  const matchedDateTasks = markdownTasksFromFiles.filter((item) => item.matchedDate);
  const otherTasks = markdownTasksFromFiles.filter((item) => !item.matchedDate);

  return {
    date: dateKey,
    sources: {
      dashboard: true,
      knowledgeVaultPath: knowledgeGraphStore.vaultPath || undefined,
      workspaceRoot: context.workspace?.workingDirectory,
      recentFiles: recentFiles.map((file) => ({ path: file.path, name: file.name, lastAccessed: file.lastAccessed })),
    },
    dashboard: {
      plannedTodos,
      completedTodos,
      updatedTodos,
      schedules,
    },
    knowledge: {
      refreshed: vaultIndexed,
      refreshError: vaultIndexError,
      vaultPath: knowledgeGraphStore.vaultPath || undefined,
      indexedAt: knowledgeGraphStore.graphData?.indexedAt ?? null,
      noteCount: notes.length,
      snippets: knowledgeSnippets,
      extractedTasks: knowledgeTasks,
    },
    workspace: {
      scannedFiles,
      tasks: {
        matchedDate: matchedDateTasks.slice(0, maxItems),
        others: otherTasks.slice(0, maxItems),
      },
    },
  };
};

const buildDailyReportBriefFromContext = (context: DailyReportCollectedContext, maxItems = 8): DailyReportBrief => {
  const completed: DailyBriefItem[] = [];
  const inProgress: DailyBriefItem[] = [];
  const meetings: DailyBriefItem[] = [];
  const risks: DailyBriefItem[] = [];
  const tomorrowPlan: DailyBriefItem[] = [];
  const seen = new Set<string>();

  context.dashboard.completedTodos.forEach((todo) => {
    addBriefItem(completed, seen, createTodoBriefText(todo, '完成'), 'dashboard.completed', maxItems);
  });
  context.workspace.tasks.matchedDate
    .filter((item) => item.checked)
    .forEach((item) =>
      addBriefItem(completed, seen, `完成 ${item.text}`, `workspace:${item.relativePath || item.filePath}`, maxItems),
    );

  context.dashboard.plannedTodos
    .filter((todo) => !Boolean(todo.completed))
    .forEach((todo) =>
      addBriefItem(inProgress, seen, createTodoBriefText(todo, '推进'), 'dashboard.planned', maxItems),
    );
  context.dashboard.updatedTodos
    .filter((todo) => !Boolean(todo.completed))
    .forEach((todo) =>
      addBriefItem(inProgress, seen, createTodoBriefText(todo, '更新'), 'dashboard.updated', maxItems),
    );
  context.workspace.tasks.matchedDate
    .filter((item) => !item.checked)
    .forEach((item) =>
      addBriefItem(inProgress, seen, `跟进 ${item.text}`, `workspace:${item.relativePath || item.filePath}`, maxItems),
    );
  context.workspace.tasks.others
    .filter((item) => !item.checked)
    .slice(0, Math.max(2, Math.floor(maxItems / 2)))
    .forEach((item) =>
      addBriefItem(
        inProgress,
        seen,
        `待推进 ${item.text}`,
        `workspace:${item.relativePath || item.filePath}`,
        maxItems,
      ),
    );

  context.dashboard.schedules.forEach((schedule) => {
    addBriefItem(meetings, seen, createScheduleBriefText(schedule), 'dashboard.schedule', maxItems);
  });
  context.knowledge.snippets
    .map((snippet) => normalizeSnippetText(snippet))
    .filter((text) => looksLikeMeeting(text))
    .forEach((text) => addBriefItem(meetings, seen, text, 'knowledge.snippet', maxItems));

  [
    ...context.dashboard.updatedTodos.map((todo) => createTodoBriefText(todo)),
    ...context.workspace.tasks.matchedDate.map((item) => item.text),
    ...context.workspace.tasks.others.map((item) => item.text),
    ...context.knowledge.snippets.map((snippet) => normalizeSnippetText(snippet)),
  ]
    .filter((text) => looksLikeRisk(text))
    .forEach((text) => addBriefItem(risks, seen, text, 'risk.detected', maxItems));

  context.dashboard.plannedTodos
    .filter((todo) => !Boolean(todo.completed))
    .forEach((todo) => addBriefItem(tomorrowPlan, seen, createTodoBriefText(todo), 'dashboard.planned', maxItems));
  context.workspace.tasks.matchedDate
    .filter((item) => !item.checked)
    .forEach((item) =>
      addBriefItem(tomorrowPlan, seen, item.text, `workspace:${item.relativePath || item.filePath}`, maxItems),
    );
  context.workspace.tasks.others
    .filter((item) => !item.checked)
    .forEach((item) =>
      addBriefItem(tomorrowPlan, seen, item.text, `workspace:${item.relativePath || item.filePath}`, maxItems),
    );

  if (!completed.length) {
    context.knowledge.snippets
      .map((snippet) => normalizeSnippetText(snippet))
      .filter(Boolean)
      .slice(0, Math.max(2, Math.floor(maxItems / 2)))
      .forEach((text) => addBriefItem(completed, seen, text, 'knowledge.snippet', maxItems));
  }

  const evidenceSources = Array.from(
    new Set(
      [
        context.sources.dashboard ? 'dashboard' : '',
        context.knowledge.noteCount > 0 ? 'knowledge' : '',
        context.workspace.scannedFiles.length ? 'workspace' : '',
      ].filter(Boolean),
    ),
  );

  const reportMarkdown = [
    `# 今日日报（${context.date}）`,
    '',
    ...formatBriefSection('一、今日完成', completed),
    '',
    ...formatBriefSection('二、进行中事项', inProgress),
    '',
    ...formatBriefSection('三、会议与沟通', meetings),
    '',
    ...formatBriefSection('四、问题与风险', risks),
    '',
    ...formatBriefSection('五、明日计划', tomorrowPlan),
    '',
    '## 六、证据来源',
    evidenceSources.length ? `- ${evidenceSources.join('、')}` : '- 本地来源为空',
  ].join('\n');

  return {
    date: context.date,
    summary: {
      completedCount: completed.length,
      inProgressCount: inProgress.length,
      meetingCount: meetings.length,
      riskCount: risks.length,
      tomorrowCount: tomorrowPlan.length,
      sourceCount: evidenceSources.length,
    },
    sections: {
      completed,
      inProgress,
      meetings,
      risks,
      tomorrowPlan,
    },
    evidenceSources,
    reportMarkdown,
    guidance: [
      '优先使用 reportMarkdown 生成正式日报。',
      '如果某一节为空，应如实说明，而不是编造内容。',
      '若 evidenceSources 非空，不要声称没有本地读取工具。',
    ],
  };
};

export const collectDailyReportContextTool: AIToolDefinition<CollectDailyReportContextInput> = {
  name: 'collect-daily-report-context',
  title: '收集日报上下文',
  description:
    'Collect daily report context from dashboard todos/schedules, knowledge base notes, and workspace markdown task files.',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Target date in YYYY-MM-DD. Defaults to today.' },
      query: { type: 'string', description: 'Optional query for knowledge snippet search.' },
      maxItems: { type: 'number', description: 'Maximum items per section (1-200).' },
      maxFiles: { type: 'number', description: 'Maximum markdown files to scan (1-300).' },
      refreshKnowledgeIndex: {
        type: 'boolean',
        description: 'Refresh knowledge index before collecting (read-only mode allowed).',
      },
    },
    required: [],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: false,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<CollectDailyReportContextInput>(input, (record) => {
      const date = textInput(record.date) || todayKey();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'date 必须是 YYYY-MM-DD。';
      const query = textInput(record.query) || undefined;
      const maxItems =
        typeof record.maxItems === 'number' && Number.isFinite(record.maxItems)
          ? Math.max(1, Math.min(200, Math.floor(record.maxItems)))
          : 50;
      const maxFiles =
        typeof record.maxFiles === 'number' && Number.isFinite(record.maxFiles)
          ? Math.max(1, Math.min(300, Math.floor(record.maxFiles)))
          : 180;
      const refreshKnowledgeIndex =
        record.refreshKnowledgeIndex !== undefined ? Boolean(record.refreshKnowledgeIndex) : true;
      return {
        date,
        query,
        maxItems,
        maxFiles,
        refreshKnowledgeIndex,
      };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '日报上下文收集为本地只读工具（允许只读模式下刷新索引缓存）。' };
  },
  async call(input, context, onProgress) {
    return collectDailyReportContextData(input, context, onProgress);
  },
};

export interface BuildDailyReportBriefInput extends CollectDailyReportContextInput {}

export const buildDailyReportBriefTool: AIToolDefinition<BuildDailyReportBriefInput> = {
  name: 'build-daily-report-brief',
  title: '生成日报摘要',
  description: 'Build a concise daily report brief from local dashboard, knowledge, and workspace evidence.',
  inputSchema: collectDailyReportContextTool.inputSchema,
  readOnly: true,
  concurrencySafe: false,
  defaultPermission: 'allow',
  validate: collectDailyReportContextTool.validate,
  checkPermission() {
    return { behavior: 'allow', reason: '日报摘要生成依赖本地只读证据。' };
  },
  async call(input, context, onProgress) {
    const collected = await collectDailyReportContextData(
      {
        ...input,
        refreshKnowledgeIndex: input.refreshKnowledgeIndex ?? false,
      },
      context,
      onProgress,
    );
    const brief = buildDailyReportBriefFromContext(collected, Math.min(8, input.maxItems ?? 8));
    return {
      ...brief,
      rawContextSummary: {
        dashboardTodos:
          collected.dashboard.plannedTodos.length +
          collected.dashboard.completedTodos.length +
          collected.dashboard.updatedTodos.length,
        schedules: collected.dashboard.schedules.length,
        knowledgeSnippets: collected.knowledge.snippets.length,
        knowledgeTasks: collected.knowledge.extractedTasks.length,
        workspaceTasks: collected.workspace.tasks.matchedDate.length + collected.workspace.tasks.others.length,
      },
    };
  },
};

export const collectTodayWorkActivitiesTool: AIToolDefinition<Record<string, never>> = {
  name: 'collect-today-work-activities',
  title: '收集今日工作活动',
  description: 'Collect today work activities from assistant runtime, recent files, and dashboard.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: false,
  defaultPermission: 'allow',
  validate() {
    return { ok: true, input: {} };
  },
  checkPermission() {
    return { behavior: 'allow', reason: '只读收集今日软件内工作活动。' };
  },
  async call(_input, _context, onProgress) {
    onProgress({ message: '正在收集今日工作活动...' });
    return collectTodayWorkActivities();
  },
};

export const buildTodayWorkReportTool: AIToolDefinition<Record<string, never>> = {
  name: 'build-today-work-report',
  title: '生成今日日报摘要',
  description: 'Build a daily work report brief from today work activities.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: false,
  defaultPermission: 'allow',
  validate() {
    return { ok: true, input: {} };
  },
  checkPermission() {
    return { behavior: 'allow', reason: '只读生成今日日报摘要。' };
  },
  async call(_input, _context, onProgress) {
    onProgress({ message: '正在生成今日日报摘要...' });
    return buildTodayWorkReportBrief();
  },
};

export interface SaveDocumentInput {
  title: string;
  content: string;
  directory?: string;
}

export const saveDocumentTool: AIToolDefinition<SaveDocumentInput> = {
  name: 'save-document',
  title: '保存文档',
  description: 'Save markdown content as a local document file and return the saved path.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Document title.' },
      content: { type: 'string', description: 'Markdown content.' },
      directory: { type: 'string', description: 'Optional target directory.' },
    },
    required: ['title', 'content'],
    additionalProperties: false,
  },
  readOnly: false,
  concurrencySafe: false,
  defaultPermission: 'ask',
  validate(input) {
    return validateObject<SaveDocumentInput>(input, (record) => {
      const title = textInput(record.title) || '未命名文档';
      const content = textInput(record.content);
      const directory = textInput(record.directory) || undefined;
      if (!content) return '缺少 content。';
      return { title, content, directory };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: 'Phase 2 暂时允许保存文档；Phase 3 将接入写入确认。' };
  },
  async call(input, context, onProgress) {
    const fallbackDir = joinWorkspacePath(await documentDir(), 'workgaga', 'AI-文档');
    const baseDir = input.directory
      ? resolveWorkspacePath(context.workspace, input.directory)
      : context.workspace?.outputDirectory || fallbackDir;
    await mkdir(baseDir, { recursive: true });
    const safeName = input.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
    const fileName = `${safeName || 'AI文档'}-${todayKey()}.md`;
    const path = isAbsoluteWorkspacePath(fileName) ? fileName : joinWorkspacePath(baseDir, fileName);
    onProgress({ message: `正在保存文档 ${path}...` });
    await writeTextFile(path, input.content);
    return {
      path,
      title: input.title,
      bytes: input.content.length,
      workingDirectory: context.workspace?.workingDirectory,
    };
  },
};

export interface CreateTodoInput {
  content: string;
  plannedDate?: string;
  priority?: 'low' | 'medium' | 'high';
  scene?: 'deep_work' | 'collaboration' | 'admin' | 'learning';
  tags?: string[];
}

export const createTodoTool: AIToolDefinition<CreateTodoInput> = {
  name: 'create-todo',
  title: '创建待办',
  description: 'Create a todo item in workgaga dashboard.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Todo content.' },
      plannedDate: { type: 'string', description: 'Planned date in YYYY-MM-DD.' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority.' },
      scene: {
        type: 'string',
        enum: ['deep_work', 'collaboration', 'admin', 'learning'],
        description: 'Work scene for this todo.',
      },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional labels for this todo.' },
    },
    required: ['content'],
    additionalProperties: false,
  },
  readOnly: false,
  concurrencySafe: false,
  defaultPermission: 'ask',
  validate(input) {
    return validateObject<CreateTodoInput>(input, (record) => {
      const content = textInput(record.content);
      if (!content) return '缺少 content。';
      const plannedDate = textInput(record.plannedDate) || todayKey();
      const priority = ['low', 'medium', 'high'].includes(String(record.priority))
        ? (record.priority as CreateTodoInput['priority'])
        : 'medium';
      const scene =
        record.scene === 'deep_work' ||
        record.scene === 'collaboration' ||
        record.scene === 'admin' ||
        record.scene === 'learning'
          ? (record.scene as CreateTodoInput['scene'])
          : undefined;
      const tags = Array.isArray(record.tags)
        ? record.tags
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
            .filter((tag, index, list) => list.indexOf(tag) === index)
        : undefined;
      return { content, plannedDate, priority, scene, tags };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: 'Phase 2 暂时允许创建待办；Phase 3 将接入动作确认。' };
  },
  async call(input) {
    const dashboardStore = useDashboardStore();
    dashboardStore.addTodo(input.content, input.plannedDate, input.priority, undefined, {
      scene: input.scene,
      tags: input.tags,
    });
    return {
      created: true,
      content: input.content,
      plannedDate: input.plannedDate,
      priority: input.priority,
      scene: input.scene,
      tags: input.tags ?? [],
    };
  },
};

export interface CreateScheduleInput {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  description?: string;
}

export const createScheduleTool: AIToolDefinition<CreateScheduleInput> = {
  name: 'create-schedule',
  title: '创建日程',
  description: 'Create a schedule item in workgaga dashboard.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Schedule title.' },
      date: { type: 'string', description: 'Date in YYYY-MM-DD.' },
      startTime: { type: 'string', description: 'Start time in HH:mm.' },
      endTime: { type: 'string', description: 'End time in HH:mm.' },
      description: { type: 'string', description: 'Optional description.' },
    },
    required: ['title', 'date'],
    additionalProperties: false,
  },
  readOnly: false,
  concurrencySafe: false,
  defaultPermission: 'ask',
  validate(input) {
    return validateObject<CreateScheduleInput>(input, (record) => {
      const title = textInput(record.title);
      const date = textInput(record.date);
      if (!title) return '缺少 title。';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'date 必须是 YYYY-MM-DD。';
      return {
        title,
        date,
        startTime: textInput(record.startTime) || undefined,
        endTime: textInput(record.endTime) || undefined,
        description: textInput(record.description) || undefined,
      };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '已通过统一权限引擎。' };
  },
  async call(input) {
    const dashboardStore = useDashboardStore();
    dashboardStore.addSchedule(input.title, input.date, input.startTime, input.endTime, input.description);
    return { created: true, ...input };
  },
};

export const refreshKnowledgeIndexTool: AIToolDefinition<Record<string, never>> = {
  name: 'refresh-knowledge-index',
  title: '刷新知识库索引',
  description: 'Refresh the current local knowledge base index.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  readOnly: false,
  concurrencySafe: false,
  defaultPermission: 'ask',
  validate() {
    return { ok: true, input: {} };
  },
  checkPermission() {
    return { behavior: 'allow', reason: 'Phase 2 暂时允许刷新索引；Phase 3 将接入动作确认。' };
  },
  async call() {
    const knowledgeGraphStore = useKnowledgeGraphStore();
    await knowledgeGraphStore.refresh();
    return {
      refreshed: true,
      vaultPath: knowledgeGraphStore.vaultPath,
      noteCount: knowledgeGraphStore.noteCount,
      linkCount: knowledgeGraphStore.linkCount,
    };
  },
};

export const builtinAITools: AIToolDefinition[] = [
  webSearchTool,
  webFetchTool,
  weatherForecastTool,
  searchKnowledgeTool,
  listKnowledgeNotesTool,
  readKnowledgeNoteTool,
  collectTodayWorkActivitiesTool,
  buildTodayWorkReportTool,
  collectDailyReportContextTool,
  buildDailyReportBriefTool,
  listTodosTool,
  getTodoTool,
  listSchedulesTool,
  getScheduleTool,
  saveDocumentTool,
  createTodoTool,
  createScheduleTool,
  refreshKnowledgeIndexTool,
  ...developerAITools,
];
