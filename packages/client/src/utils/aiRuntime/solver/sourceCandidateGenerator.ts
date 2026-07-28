import type { AIEvidencePlan } from './evidencePlan';
import type { AITaskProfile } from './taskProfile';

export interface AISourceCandidate {
  query?: string;
  url?: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

export const generateSourceCandidates = (params: {
  userInput: string;
  taskProfile?: AITaskProfile;
  evidencePlan?: AIEvidencePlan;
}): AISourceCandidate[] => {
  const missingExternalEvidence = params.evidencePlan?.needs.some((need) => need.id === 'external_evidence' && !need.satisfied) ?? params.taskProfile?.requiresExternalEvidence;
  if (!missingExternalEvidence) return [];

  const base = params.userInput.trim();
  const genericQueries = unique([
    `${base} 官方`,
    `${base} 最新`,
    `${base} 数据 来源`,
    `${base} 报告`,
    `${base} 新闻`,
  ]).filter((query) => query.length >= 2);

  return genericQueries.slice(0, 5).map((query, index) => ({
    query,
    reason: index === 0 ? '优先尝试官方或一手来源。' : '搜索为空后生成的通用候选来源查询。',
    confidence: index <= 1 ? 'medium' : 'low',
  }));
};

export const formatSourceCandidates = (candidates: AISourceCandidate[]): string[] => candidates.map((candidate) => (
  candidate.url
    ? `${candidate.url} (${candidate.reason})`
    : `${candidate.query || '-'} (${candidate.reason})`
));
