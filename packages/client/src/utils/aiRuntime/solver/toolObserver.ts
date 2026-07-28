import type { AIProblemPolicy, AIToolObservation } from './types';

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
};

const getNestedArrayLength = (output: unknown, keys: string[]): number | undefined => {
  if (!output || typeof output !== 'object') return undefined;
  let current: unknown = output;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current.length : undefined;
};

const getNestedNumber = (output: unknown, keys: string[]): number | undefined => {
  if (!output || typeof output !== 'object') return undefined;
  let current: unknown = output;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : undefined;
};

export const observeToolResult = (params: {
  toolName: string;
  output?: unknown;
  error?: string;
  policy: AIProblemPolicy;
}): AIToolObservation => {
  if (params.error) {
    return {
      ok: false,
      confidence: 'low',
      shouldRetry: params.policy.fallbackTools.length > 0,
      fallbackToolNames: params.policy.fallbackTools,
      summary: `${params.toolName} 执行失败：${params.error}`,
      reason: params.error,
    };
  }

  if (isEmptyValue(params.output)) {
    return {
      ok: false,
      confidence: 'low',
      shouldRetry: params.policy.fallbackTools.length > 0,
      fallbackToolNames: params.policy.fallbackTools,
      summary: `${params.toolName} 返回空结果。`,
      reason: 'empty_result',
    };
  }

  if (params.toolName === 'weather-forecast') {
    const days = getNestedArrayLength(params.output, ['days']);
    if (!days) {
      return {
        ok: false,
        confidence: 'low',
        shouldRetry: params.policy.fallbackTools.length > 0,
        fallbackToolNames: params.policy.fallbackTools,
        summary: '天气工具没有返回有效日期预报。',
        reason: 'missing_weather_days',
      };
    }
  }

  if (params.toolName === 'web-search') {
    const results = getNestedArrayLength(params.output, ['results']);
    if (!results) {
      return {
        ok: false,
        confidence: 'low',
        shouldRetry: params.policy.fallbackTools.length > 0,
        fallbackToolNames: params.policy.fallbackTools,
        summary: '搜索工具没有返回结果。',
        reason: 'empty_search_results',
      };
    }
  }

  if (params.toolName === 'list-todos') {
    const total = getNestedNumber(params.output, ['total']) ?? getNestedArrayLength(params.output, ['items']);
    if (!total) {
      return {
        ok: false,
        confidence: 'medium',
        shouldRetry: true,
        fallbackToolNames: [],
        summary: '待办列表为空。',
        reason: 'empty_todos',
      };
    }
  }

  if (params.toolName === 'list-schedules') {
    const total = getNestedNumber(params.output, ['total']) ?? getNestedArrayLength(params.output, ['items']);
    if (!total) {
      return {
        ok: false,
        confidence: 'medium',
        shouldRetry: true,
        fallbackToolNames: [],
        summary: '日程列表为空。',
        reason: 'empty_schedules',
      };
    }
  }

  if (params.toolName === 'collect-daily-report-context') {
    const plannedTodos = getNestedArrayLength(params.output, ['dashboard', 'plannedTodos']) ?? 0;
    const completedTodos = getNestedArrayLength(params.output, ['dashboard', 'completedTodos']) ?? 0;
    const updatedTodos = getNestedArrayLength(params.output, ['dashboard', 'updatedTodos']) ?? 0;
    const schedules = getNestedArrayLength(params.output, ['dashboard', 'schedules']) ?? 0;
    const snippets = getNestedArrayLength(params.output, ['knowledge', 'snippets']) ?? 0;
    const tasksMatched = getNestedArrayLength(params.output, ['workspace', 'tasks', 'matchedDate']) ?? 0;
    const tasksOthers = getNestedArrayLength(params.output, ['workspace', 'tasks', 'others']) ?? 0;
    const hasAnything =
      plannedTodos + completedTodos + updatedTodos + schedules + snippets + tasksMatched + tasksOthers > 0;
    if (!hasAnything) {
      return {
        ok: false,
        confidence: 'medium',
        shouldRetry: true,
        fallbackToolNames: [],
        summary: '未收集到足够的本地日报上下文（待办/日程/知识库/任务文件均为空）。',
        reason: 'empty_daily_report_context',
      };
    }
  }

  if (params.toolName === 'build-daily-report-brief') {
    const completed = getNestedNumber(params.output, ['summary', 'completedCount']) ?? 0;
    const inProgress = getNestedNumber(params.output, ['summary', 'inProgressCount']) ?? 0;
    const meetings = getNestedNumber(params.output, ['summary', 'meetingCount']) ?? 0;
    const risks = getNestedNumber(params.output, ['summary', 'riskCount']) ?? 0;
    const tomorrow = getNestedNumber(params.output, ['summary', 'tomorrowCount']) ?? 0;
    const hasAnything = completed + inProgress + meetings + risks + tomorrow > 0;
    if (!hasAnything) {
      return {
        ok: false,
        confidence: 'medium',
        shouldRetry: true,
        fallbackToolNames: [],
        summary: '日报摘要为空，无法直接生成日报。',
        reason: 'empty_daily_report_brief',
      };
    }
  }

  if (params.toolName === 'collect-today-work-activities') {
    const activities = getNestedArrayLength(params.output, ['activities']) ?? 0;
    const coverage = getNestedNumber(params.output, ['coverageScore']) ?? 0;
    if (activities === 0 && coverage === 0) {
      return {
        ok: false,
        confidence: 'medium',
        shouldRetry: true,
        fallbackToolNames: [],
        summary: '今日工作活动为空。',
        reason: 'empty_today_work_activities',
      };
    }
  }

  if (params.toolName === 'build-today-work-report') {
    const coverage = getNestedNumber(params.output, ['coverageScore']) ?? 0;
    const completed = getNestedArrayLength(params.output, ['completed']) ?? 0;
    const inProgress = getNestedArrayLength(params.output, ['inProgress']) ?? 0;
    const meetings = getNestedArrayLength(params.output, ['meetings']) ?? 0;
    const risks = getNestedArrayLength(params.output, ['risks']) ?? 0;
    const nextPlan = getNestedArrayLength(params.output, ['nextPlan']) ?? 0;
    const diagnostics = getNestedArrayLength(params.output, ['diagnostics']) ?? 0;
    if (coverage <= 0 && completed + inProgress + meetings + risks + nextPlan === 0) {
      if (diagnostics > 0) {
        return {
          ok: true,
          confidence: 'medium',
          shouldRetry: false,
          fallbackToolNames: [],
          summary: '今日日报摘要为空，但已完成来源诊断。',
          reason: 'diagnostics_only_today_work_report',
        };
      }
      return {
        ok: false,
        confidence: 'medium',
        shouldRetry: true,
        fallbackToolNames: [],
        summary: '今日日报摘要为空。',
        reason: 'empty_today_work_report',
      };
    }
  }

  if (params.toolName === 'search-knowledge') {
    const snippets = getNestedArrayLength(params.output, ['snippets']);
    if (snippets === 0) {
      return {
        ok: false,
        confidence: 'medium',
        shouldRetry: false,
        fallbackToolNames: [],
        summary: '知识库检索完成，但没有匹配片段。',
        reason: 'no_knowledge_matches',
      };
    }
  }

  return {
    ok: true,
    confidence: 'high',
    shouldRetry: false,
    fallbackToolNames: [],
    summary: `${params.toolName} 返回了可用结果。`,
  };
};
