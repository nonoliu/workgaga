import { hasSuccessfulEvidenceFromTool } from '../task/taskEvidence';
import type { AIEvidenceItem } from '../task/taskTypes';
import type {
  AICodeEvidenceRunResult,
  AIFinalAnswerVerification,
  AIIntentDetectionResult,
  AIProblemPolicy,
  AIPreflightRunResult,
} from './types';

const hasSuccessfulTool = (preflight: AIPreflightRunResult | undefined, names: string[]): boolean =>
  Boolean(preflight?.results.some((result) => names.includes(result.toolName) && result.ok));

const hasAttemptedTool = (preflight: AIPreflightRunResult | undefined, names: string[]): boolean =>
  Boolean(preflight?.results.some((result) => names.includes(result.toolName)));

type MissingRequirementPriority = 'required' | 'preferred' | 'optional';

interface MissingRequirementItem {
  key: string;
  label: string;
  priority: MissingRequirementPriority;
  penalty: number;
  nextActions: string[];
}

const uniqueStrings = (items: string[]): string[] => Array.from(new Set(items.filter(Boolean)));

const getPrimaryMissingItems = (items: MissingRequirementItem[]): MissingRequirementItem[] => {
  if (!items.length) return [];
  const requiredItems = items.filter((item) => item.priority === 'required');
  if (requiredItems.length) return requiredItems;
  const maxPenalty = Math.max(...items.map((item) => item.penalty));
  return items.filter((item) => item.penalty === maxPenalty);
};

const sortMissingRequirements = (items: MissingRequirementItem[]): MissingRequirementItem[] =>
  [...items].sort((left, right) => right.penalty - left.penalty || left.label.localeCompare(right.label));

const createMissingRequirement = (params: {
  key: string;
  label: string;
  priority: MissingRequirementPriority;
  penalty: number;
  nextActions: string[];
}): MissingRequirementItem => ({
  key: params.key,
  label: params.label,
  priority: params.priority,
  penalty: params.penalty,
  nextActions: params.nextActions,
});

const parseEvidenceMissingRequirement = (requirement: string): MissingRequirementItem => {
  const [rawId, ...rest] = requirement.split(':');
  const id = rawId.trim();
  const description = rest.join(':').trim();
  switch (id) {
    case 'external_evidence':
      return createMissingRequirement({
        key: 'external_evidence',
        label: requirement,
        priority: 'required',
        penalty: 35,
        nextActions: [
          '优先继续尝试 web-search、web-fetch 或其他外部来源，补足最新证据。',
          '说明已尝试的联网工具，并提供可重试查询词或来源建议。',
        ],
      });
    case 'local_context':
      return createMissingRequirement({
        key: 'local_context',
        label: requirement,
        priority: 'required',
        penalty: 25,
        nextActions: ['补充路径、文件名、关键词或允许继续检索本地上下文。'],
      });
    case 'user_context':
      return createMissingRequirement({
        key: 'user_context',
        label: requirement,
        priority: 'preferred',
        penalty: 10,
        nextActions: ['如需更具体建议，再补充目标、约束、时间范围、风险偏好或已有数据。'],
      });
    case 'artifact_output':
      return createMissingRequirement({
        key: 'artifact_output',
        label: requirement,
        priority: 'preferred',
        penalty: 8,
        nextActions: ['确认是否需要生成或保存产物，并明确输出形式。'],
      });
    case 'risk_context':
      return createMissingRequirement({
        key: 'risk_context',
        label: requirement,
        priority: 'required',
        penalty: 6,
        nextActions: ['补充风险边界、不确定性与适用前提说明。'],
      });
    default:
      return createMissingRequirement({
        key: id || requirement,
        label: description ? `${id}: ${description}` : requirement,
        priority: 'required',
        penalty: 20,
        nextActions: ['补充缺失上下文或允许继续执行相关工具。'],
      });
  }
};

const registerMissingRequirement = (map: Map<string, MissingRequirementItem>, item: MissingRequirementItem): void => {
  const existing = map.get(item.key);
  if (!existing || item.penalty > existing.penalty || item.label.length > existing.label.length) {
    map.set(item.key, item);
  }
};

export const verifyFinalAnswerReadiness = (params: {
  detection: AIIntentDetectionResult;
  policy: AIProblemPolicy;
  preflight?: AIPreflightRunResult;
  codeEvidence?: AICodeEvidenceRunResult;
  evidence?: AIEvidenceItem[];
}): AIFinalAnswerVerification => {
  const requiredEvidence: string[] = [];
  const availableEvidence: string[] = [];
  const reasons: string[] = [];
  const missingRequirementMap = new Map<string, MissingRequirementItem>();

  params.preflight?.results.forEach((result) => {
    availableEvidence.push(`${result.toolName}:${result.ok ? 'ok' : 'error'}`);
  });

  if (!params.policy.verificationRequired) {
    return {
      status: 'ready',
      ok: true,
      confidence: availableEvidence.length ? 'high' : 'medium',
      blocking: false,
      reasons: ['该问题类型不要求强验证。'],
      requiredEvidence,
      availableEvidence,
      completionScore: 100,
      missingRequirementKeys: [],
      missingRequirements: [],
      primaryMissingRequirementKeys: [],
      primaryMissingRequirements: [],
      secondaryMissingRequirementKeys: [],
      secondaryMissingRequirements: [],
      nextActions: [],
      primaryNextActions: [],
      secondaryNextActions: [],
    };
  }

  switch (params.detection.intent) {
    case 'weather_query':
      requiredEvidence.push('weather-forecast 或 web-search/web-fetch fallback 成功结果');
      if (
        hasSuccessfulTool(params.preflight, ['weather-forecast', 'web-search', 'web-fetch']) ||
        hasSuccessfulEvidenceFromTool(params.evidence || [], ['weather-forecast', 'web-search', 'web-fetch'])
      ) {
        reasons.push('已获得天气或 fallback 工具结果。');
      } else {
        reasons.push('缺少天气或 fallback 工具成功结果。');
        registerMissingRequirement(
          missingRequirementMap,
          createMissingRequirement({
            key: 'external_evidence',
            label: 'weather-forecast 或 web-search/web-fetch fallback 成功结果',
            priority: 'required',
            penalty: 35,
            nextActions: [
              '优先继续尝试 weather-forecast、web-search 或 web-fetch，补足外部证据。',
              '说明已尝试的联网工具，并提供可重试查询词或来源建议。',
            ],
          }),
        );
      }
      break;
    case 'realtime_query':
    case 'web_research':
      requiredEvidence.push('web-search 或 web-fetch 成功结果');
      if (hasSuccessfulTool(params.preflight, ['web-search', 'web-fetch'])) {
        reasons.push('已获得联网搜索或网页读取结果。');
      } else {
        reasons.push('缺少联网搜索或网页读取成功结果。');
        registerMissingRequirement(
          missingRequirementMap,
          createMissingRequirement({
            key: 'external_evidence',
            label: 'web-search 或 web-fetch 成功结果',
            priority: 'required',
            penalty: 35,
            nextActions: [
              '优先继续尝试 web-search、web-fetch 或其他外部来源，补足最新证据。',
              '说明已尝试的联网工具，并提供可重试查询词或来源建议。',
            ],
          }),
        );
      }
      break;
    case 'url_reading':
      requiredEvidence.push('web-fetch 成功结果');
      if (hasSuccessfulTool(params.preflight, ['web-fetch'])) {
        reasons.push('已成功读取 URL。');
      } else {
        reasons.push('缺少 URL 读取成功结果。');
        registerMissingRequirement(
          missingRequirementMap,
          createMissingRequirement({
            key: 'external_evidence',
            label: 'web-fetch 成功结果',
            priority: 'required',
            penalty: 30,
            nextActions: ['继续尝试读取目标 URL，或补充可访问的候选链接。'],
          }),
        );
      }
      break;
    case 'knowledge_lookup':
      requiredEvidence.push('search-knowledge 已尝试');
      if (hasAttemptedTool(params.preflight, ['search-knowledge'])) {
        reasons.push('已检索知识库。');
      } else {
        reasons.push('尚未检索知识库。');
        registerMissingRequirement(
          missingRequirementMap,
          createMissingRequirement({
            key: 'local_context',
            label: 'search-knowledge 已尝试',
            priority: 'required',
            penalty: 20,
            nextActions: ['先检索本地知识库，必要时补充关键词或路径范围。'],
          }),
        );
      }
      break;
    case 'code_understanding':
    case 'code_modification':
    case 'troubleshooting':
      requiredEvidence.push('代码证据收集结果、search-files/read-file 证据或明确说明缺少路径上下文');
      if (
        params.codeEvidence?.ok ||
        hasSuccessfulEvidenceFromTool(params.evidence || [], ['list-files', 'search-files', 'read-file'])
      ) {
        reasons.push('已通过 Runtime 收集代码证据。');
      } else if (params.codeEvidence?.attempted) {
        reasons.push('已尝试收集代码证据，但证据不足或缺少路径上下文。');
        registerMissingRequirement(
          missingRequirementMap,
          createMissingRequirement({
            key: 'local_context',
            label: '代码证据不足或缺少路径上下文',
            priority: 'required',
            penalty: 25,
            nextActions: ['补充路径、报错信息、文件名或允许继续检索代码上下文。'],
          }),
        );
      } else if (hasAttemptedTool(params.preflight, ['search-files', 'read-file'])) {
        reasons.push('已尝试收集代码上下文。');
      } else {
        reasons.push('尚未收集代码上下文；如果没有路径信息，最终回答必须说明限制。');
        registerMissingRequirement(
          missingRequirementMap,
          createMissingRequirement({
            key: 'local_context',
            label: '代码证据收集结果、search-files/read-file 证据或明确说明缺少路径上下文',
            priority: 'required',
            penalty: 25,
            nextActions: ['补充路径、文件名、关键词或允许继续检索代码上下文。'],
          }),
        );
      }
      break;
    case 'document_generation':
      if (params.detection.entities?.subtype === 'daily_report') {
        requiredEvidence.push('build-today-work-report 生成的活动摘要或完整来源诊断');
        const reportOutput = getSuccessfulToolOutput(params.preflight, 'build-today-work-report');
        const coverageScore = getNestedNumber(reportOutput, ['coverageScore']) ?? 0;
        const completed = getNestedArrayLength(reportOutput, ['completed']) ?? 0;
        const inProgress = getNestedArrayLength(reportOutput, ['inProgress']) ?? 0;
        const meetings = getNestedArrayLength(reportOutput, ['meetings']) ?? 0;
        const risks = getNestedArrayLength(reportOutput, ['risks']) ?? 0;
        const nextPlan = getNestedArrayLength(reportOutput, ['nextPlan']) ?? 0;
        const diagnostics = getNestedArrayLength(reportOutput, ['diagnostics']) ?? 0;
        const hasSections = completed + inProgress + meetings + risks + nextPlan > 0;
        if (coverageScore > 0 || hasSections) {
          reasons.push('已生成可用的今日工作活动摘要。');
        } else if (diagnostics > 0) {
          reasons.push('已完成来源诊断，可按受限结果交付。');
        } else {
          reasons.push('缺少今日工作活动摘要或完整来源诊断。');
          registerMissingRequirement(
            missingRequirementMap,
            createMissingRequirement({
              key: 'local_context',
              label: 'build-today-work-report 生成的活动摘要或完整来源诊断',
              priority: 'required',
              penalty: 25,
              nextActions: ['继续收集软件内活动，或补充今天的线下工作/会议记录。'],
            }),
          );
        }
        break;
      }
      requiredEvidence.push('按问题策略需要的工具证据');
      if (params.preflight?.results.some((result) => result.ok)) {
        reasons.push('已有至少一个成功工具结果。');
      } else {
        reasons.push('缺少成功工具结果。');
        registerMissingRequirement(
          missingRequirementMap,
          createMissingRequirement({
            key: 'tool_evidence',
            label: '按问题策略需要的工具证据',
            priority: 'required',
            penalty: 20,
            nextActions: ['补充缺失上下文或允许继续执行相关工具。'],
          }),
        );
      }
      break;
    default:
      requiredEvidence.push('按问题策略需要的工具证据');
      if (params.preflight?.results.some((result) => result.ok)) {
        reasons.push('已有至少一个成功工具结果。');
      } else {
        reasons.push('缺少成功工具结果。');
        registerMissingRequirement(
          missingRequirementMap,
          createMissingRequirement({
            key: 'tool_evidence',
            label: '按问题策略需要的工具证据',
            priority: 'required',
            penalty: 20,
            nextActions: ['补充缺失上下文或允许继续执行相关工具。'],
          }),
        );
      }
  }

  const ok = reasons.every((reason) => !reason.includes('缺少') && !reason.includes('尚未'));
  const hasAttempts = Boolean(params.preflight?.results.length || params.codeEvidence?.attempted);
  const degraded = !ok && Boolean(params.policy.degradedAnswerAllowed) && hasAttempts;
  const status = ok ? 'ready' : degraded ? 'degraded' : 'blocked';
  (params.preflight?.missingEvidence ?? []).forEach((requirement) => {
    registerMissingRequirement(missingRequirementMap, parseEvidenceMissingRequirement(requirement));
  });
  const missingItems = sortMissingRequirements(Array.from(missingRequirementMap.values()));
  const missingRequirementKeys = missingItems.map((item) => item.key);
  const missingRequirements = missingItems.map((item) => item.label);
  const primaryMissingItems = getPrimaryMissingItems(missingItems);
  const primaryMissingRequirementKeys = new Set(primaryMissingItems.map((item) => item.key));
  const secondaryMissingItems = missingItems.filter((item) => !primaryMissingRequirementKeys.has(item.key));
  const primaryMissingKeys = primaryMissingItems.map((item) => item.key);
  const secondaryMissingKeys = secondaryMissingItems.map((item) => item.key);
  const primaryMissingRequirements = primaryMissingItems.map((item) => item.label);
  const secondaryMissingRequirements = secondaryMissingItems.map((item) => item.label);
  const penaltySum = missingItems.reduce((sum, item) => sum + item.penalty, 0);
  const rawScore = Math.max(0, 100 - penaltySum - (hasAttempts ? 0 : 20));
  const completionScore = ok
    ? 100
    : degraded
      ? Math.max(30, Math.min(85, rawScore))
      : Math.max(5, Math.min(60, rawScore));
  const primaryNextActions = uniqueStrings(primaryMissingItems.flatMap((item) => item.nextActions));
  const secondaryNextActions = uniqueStrings(secondaryMissingItems.flatMap((item) => item.nextActions));
  const nextActions = ok
    ? []
    : uniqueStrings([
        ...primaryNextActions,
        ...secondaryNextActions,
        ...(params.policy.minimumDeliverable ?? []),
        '补充缺失上下文或允许继续执行相关工具。',
      ]);
  return {
    status,
    ok,
    confidence: ok ? 'high' : availableEvidence.length || degraded ? 'medium' : 'low',
    blocking: status === 'blocked' && !params.policy.directAnswerAllowed,
    reasons,
    requiredEvidence,
    availableEvidence,
    completionScore,
    missingRequirementKeys,
    missingRequirements,
    primaryMissingRequirementKeys: primaryMissingKeys,
    primaryMissingRequirements,
    secondaryMissingRequirementKeys: secondaryMissingKeys,
    secondaryMissingRequirements,
    nextActions,
    primaryNextActions,
    secondaryNextActions,
    guidance: ok
      ? '可以生成最终回答，但必须基于已获得证据。'
      : degraded
        ? '证据不足但已执行恢复或尝试。可以给出受限完成结果，必须说明已尝试的工具、失败原因、当前限制和下一步操作。'
        : '证据不足。若继续回答，必须明确说明已尝试的工具、失败原因和当前限制，不得假装已经验证。',
  };
};

const getSuccessfulToolOutput = (
  preflight: AIPreflightRunResult | undefined,
  toolName: string,
): Record<string, unknown> | undefined => {
  const output = preflight?.results.find((result) => result.toolName === toolName && result.ok)?.output;
  return output && typeof output === 'object' ? (output as Record<string, unknown>) : undefined;
};

const getNestedArrayLength = (value: unknown, path: string[]): number | undefined => {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current.length : undefined;
};

const getNestedNumber = (value: unknown, path: string[]): number | undefined => {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : undefined;
};

const contradictionPatterns = [
  /没有可用的本地读取工具/i,
  /当前会话没有可用的本地读取工具/i,
  /无法自动汇总.*待办.*日程.*知识库/i,
  /不能凭空生成具体工作内容/i,
  /把今天的工作要点.*发我/i,
  /先给你一个可直接填写的日报模板/i,
];

export const evaluateDailyReportAnswerConsistency = (params: {
  detection: AIIntentDetectionResult;
  preflight?: AIPreflightRunResult;
  answer: string;
}): {
  applicable: boolean;
  ok: boolean;
  reasons: string[];
  shouldRetry: boolean;
  retryPrompt?: string;
} => {
  if (params.detection.entities?.subtype !== 'daily_report') {
    return { applicable: false, ok: true, reasons: [], shouldRetry: false };
  }

  const brief =
    getSuccessfulToolOutput(params.preflight, 'build-today-work-report') ||
    getSuccessfulToolOutput(params.preflight, 'build-daily-report-brief');
  const reportMarkdown = typeof brief?.reportMarkdown === 'string' ? brief.reportMarkdown : '';
  const completed =
    getNestedArrayLength(brief, ['completed']) ?? getNestedNumber(brief, ['summary', 'completedCount']) ?? 0;
  const inProgress =
    getNestedArrayLength(brief, ['inProgress']) ?? getNestedNumber(brief, ['summary', 'inProgressCount']) ?? 0;
  const meetings =
    getNestedArrayLength(brief, ['meetings']) ?? getNestedNumber(brief, ['summary', 'meetingCount']) ?? 0;
  const risks = getNestedArrayLength(brief, ['risks']) ?? getNestedNumber(brief, ['summary', 'riskCount']) ?? 0;
  const tomorrow =
    getNestedArrayLength(brief, ['nextPlan']) ?? getNestedNumber(brief, ['summary', 'tomorrowCount']) ?? 0;
  const evidenceCount = completed + inProgress + meetings + risks + tomorrow;

  if (!evidenceCount || !reportMarkdown.trim()) {
    return { applicable: true, ok: true, reasons: [], shouldRetry: false };
  }

  const reasons = contradictionPatterns
    .filter((pattern) => pattern.test(params.answer))
    .map((pattern) => `回答与已成功获取的日报证据冲突：${pattern}`);

  if (!reasons.length) {
    return { applicable: true, ok: true, reasons: [], shouldRetry: false };
  }

  return {
    applicable: true,
    ok: false,
    reasons,
    shouldRetry: true,
    retryPrompt: [
      '你已经通过本地只读工具成功获取日报证据，并生成了日报摘要。',
      '请直接基于下面的日报摘要生成正式回答，不要说“没有本地读取工具”、不要要求用户重复提供今天的工作内容、不要退回空模板。',
      '如果某一节证据为空，可以如实写“暂无明确记录”，但其他有证据的部分必须展开成稿。',
      '',
      '已验证的日报摘要：',
      reportMarkdown,
    ].join('\n'),
  };
};
