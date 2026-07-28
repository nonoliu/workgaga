import type { AIIntentDetectionResult } from './types';

export type AITaskDomain =
  | 'realtime'
  | 'web'
  | 'knowledge'
  | 'document'
  | 'planning'
  | 'code'
  | 'data'
  | 'analysis'
  | 'general';
export type AITaskOutputExpectation =
  | 'answer'
  | 'summary'
  | 'comparison'
  | 'recommendation'
  | 'plan'
  | 'document'
  | 'artifact'
  | 'action';

export interface AITaskProfile {
  domain: AITaskDomain;
  outputExpectation: AITaskOutputExpectation[];
  requiresFreshData: boolean;
  requiresLocalContext: boolean;
  requiresUserContext: boolean;
  requiresExternalEvidence: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  ambiguity: 'low' | 'medium' | 'high';
  subject?: string;
  timeframe?: string;
  constraints: string[];
}

const includesAny = (input: string, words: string[]): boolean => words.some((word) => input.includes(word));

const inferDomain = (detection: AIIntentDetectionResult): AITaskDomain => {
  switch (detection.intent) {
    case 'weather_query':
    case 'realtime_query':
      return 'realtime';
    case 'web_research':
    case 'url_reading':
      return 'web';
    case 'knowledge_lookup':
      return 'knowledge';
    case 'document_generation':
      return 'document';
    case 'todo_planning':
    case 'schedule_planning':
      return 'planning';
    case 'code_understanding':
    case 'code_modification':
    case 'troubleshooting':
      return 'code';
    case 'comparison_analysis':
    case 'data_extraction':
      return 'analysis';
    default:
      return 'general';
  }
};

const inferExpectations = (input: string, detection: AIIntentDetectionResult): AITaskOutputExpectation[] => {
  const expectations = new Set<AITaskOutputExpectation>(['answer']);
  if (includesAny(input, ['总结', '概括', '摘要'])) expectations.add('summary');
  if (includesAny(input, ['对比', '比较', '区别'])) expectations.add('comparison');
  if (includesAny(input, ['建议', '意见', '推荐', '怎么做', '是否应该', '值不值得']))
    expectations.add('recommendation');
  if (includesAny(input, ['计划', '步骤', '方案', '安排'])) expectations.add('plan');
  if (includesAny(input, ['生成文档', '写一份', '保存', '导出'])) expectations.add('document');
  if (detection.intent === 'document_generation') expectations.add('document');
  if (detection.intent === 'todo_planning' || detection.intent === 'schedule_planning') expectations.add('action');
  return Array.from(expectations);
};

export const buildAITaskProfile = (input: string, detection: AIIntentDetectionResult): AITaskProfile => {
  const domain = inferDomain(detection);
  const isDailyReport = detection.entities?.subtype === 'daily_report';
  const requiresFreshData =
    !isDailyReport &&
    (['weather_query', 'realtime_query', 'web_research'].includes(detection.intent) ||
      includesAny(input, ['最新', '最近', '今天', '当前', '实时', '近几天', '今年', '2026']));
  const outputExpectation = inferExpectations(input, detection);
  const requiresUserContext =
    outputExpectation.includes('recommendation') ||
    includesAny(input, ['我该', '适合我', '帮我决策', '投资建议', '购买建议']);
  const riskLevel =
    requiresUserContext || includesAny(input, ['投资', '医疗', '法律', '财务', '合同', '风险'])
      ? 'high'
      : requiresFreshData
        ? 'medium'
        : 'low';
  const ambiguity =
    requiresUserContext || includesAny(input, ['这个', '那个', '帮我看看', '怎么样']) ? 'medium' : 'low';

  return {
    domain,
    outputExpectation,
    requiresFreshData,
    requiresLocalContext:
      isDailyReport ||
      ['knowledge_lookup', 'code_understanding', 'code_modification', 'troubleshooting'].includes(detection.intent),
    requiresUserContext,
    requiresExternalEvidence:
      !isDailyReport &&
      (requiresFreshData ||
        ['web_research', 'url_reading', 'weather_query', 'realtime_query'].includes(detection.intent)),
    riskLevel,
    ambiguity,
    subject: detection.entities?.topic || detection.entities?.city || input.slice(0, 80),
    timeframe: detection.entities?.timeframe || (requiresFreshData ? 'recent/current' : undefined),
    constraints: detection.reasons,
  };
};

export const formatAITaskProfilePrompt = (profile: AITaskProfile): string =>
  [
    '# Task profile',
    `Domain: ${profile.domain}`,
    `Expected outputs: ${profile.outputExpectation.join(', ')}`,
    `Requires fresh data: ${profile.requiresFreshData}`,
    `Requires local context: ${profile.requiresLocalContext}`,
    `Requires user context: ${profile.requiresUserContext}`,
    `Requires external evidence: ${profile.requiresExternalEvidence}`,
    `Risk level: ${profile.riskLevel}`,
    `Ambiguity: ${profile.ambiguity}`,
    profile.subject ? `Subject: ${profile.subject}` : undefined,
    profile.timeframe ? `Timeframe: ${profile.timeframe}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');
