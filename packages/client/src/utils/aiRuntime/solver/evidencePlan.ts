import type { AITaskProfile } from './taskProfile';
import type { AITaskCompletionCriteria } from './completionCriteria';
import type { AIPreflightToolResult } from './types';

export interface AIEvidenceNeed {
  id: string;
  description: string;
  priority: 'required' | 'preferred' | 'optional';
  candidateTools: string[];
  fallbackStrategies: string[];
  satisfied: boolean;
}

export interface AIEvidencePlan {
  needs: AIEvidenceNeed[];
}

const uniqueNeeds = (needs: AIEvidenceNeed[]): AIEvidenceNeed[] => {
  const seen = new Set<string>();
  return needs.filter((need) => {
    if (seen.has(need.id)) return false;
    seen.add(need.id);
    return true;
  });
};

export const buildAIEvidencePlan = (profile: AITaskProfile, _criteria: AITaskCompletionCriteria): AIEvidencePlan => {
  const needs: AIEvidenceNeed[] = [];

  if (profile.requiresFreshData || profile.requiresExternalEvidence) {
    needs.push({
      id: 'external_evidence',
      description: '获取外部或最新信息来源，支撑实时/调研/事实性结论。',
      priority: 'required',
      candidateTools: ['web-search', 'web-fetch', 'weather-forecast'],
      fallbackStrategies: ['rewrite_query', 'alternate_tool', 'ask_user_for_source', 'degraded_answer'],
      satisfied: false,
    });
  }

  if (profile.requiresLocalContext) {
    needs.push({
      id: 'local_context',
      description: '获取本地知识库、文件或代码上下文。',
      priority: 'required',
      candidateTools: [
        'search-knowledge',
        'list-knowledge-notes',
        'read-knowledge-note',
        'collect-today-work-activities',
        'build-today-work-report',
        'collect-daily-report-context',
        'build-daily-report-brief',
        'list-todos',
        'get-todo',
        'list-schedules',
        'get-schedule',
        'list-files',
        'search-files',
        'read-file',
      ],
      fallbackStrategies: ['ask_user_for_path', 'degraded_answer'],
      satisfied: false,
    });
  }

  if (profile.requiresUserContext) {
    needs.push({
      id: 'user_context',
      description: '获取影响建议质量的用户目标、约束、风险偏好或场景信息。',
      priority: 'preferred',
      candidateTools: [],
      fallbackStrategies: ['ask_user', 'scenario_based_answer'],
      satisfied: false,
    });
  }

  if (profile.outputExpectation.includes('document') || profile.outputExpectation.includes('artifact')) {
    needs.push({
      id: 'artifact_output',
      description: '确认是否需要生成或保存产物，并使用工作目录输出位置。',
      priority: 'preferred',
      candidateTools: ['save-document', 'write-file'],
      fallbackStrategies: ['inline_output', 'degraded_answer'],
      satisfied: false,
    });
  }

  if (profile.riskLevel === 'high') {
    needs.push({
      id: 'risk_context',
      description: '给出风险提示、适用边界和不确定性说明。',
      priority: 'required',
      candidateTools: [],
      fallbackStrategies: ['scenario_based_answer'],
      satisfied: true,
    });
  }

  return { needs: uniqueNeeds(needs) };
};

export const evaluateAIEvidencePlan = (plan: AIEvidencePlan, results: AIPreflightToolResult[]): AIEvidencePlan => {
  const successfulTools = new Set(results.filter((result) => result.ok).map((result) => result.toolName));
  const attemptedTools = new Set(results.map((result) => result.toolName));

  return {
    needs: plan.needs.map((need) => {
      if (need.satisfied) return need;
      const toolSatisfied = need.candidateTools.some((toolName) => successfulTools.has(toolName));
      const softSatisfied =
        need.priority !== 'required' && need.candidateTools.some((toolName) => attemptedTools.has(toolName));
      return {
        ...need,
        satisfied: toolSatisfied || softSatisfied,
      };
    }),
  };
};

export const summarizeAIEvidencePlan = (plan: AIEvidencePlan): { satisfied: string[]; missing: string[] } => ({
  satisfied: plan.needs.filter((need) => need.satisfied).map((need) => `${need.id}: ${need.description}`),
  missing: plan.needs.filter((need) => !need.satisfied).map((need) => `${need.id}: ${need.description}`),
});

export const formatAIEvidencePlanPrompt = (plan: AIEvidencePlan): string =>
  [
    '# Evidence plan',
    ...plan.needs.map((need) =>
      [
        `- ${need.id} [${need.priority}]`,
        `  - Description: ${need.description}`,
        need.candidateTools.length ? `  - Candidate tools: ${need.candidateTools.join(', ')}` : undefined,
        need.fallbackStrategies.length ? `  - Fallback strategies: ${need.fallbackStrategies.join(', ')}` : undefined,
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ].join('\n');
