import type { AICodeEvidenceRunResult, AIPreflightToolResult } from '../solver';
import type { AIEvidenceItem } from './taskTypes';

const createEvidenceId = (): string => `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const addEvidenceItem = (items: AIEvidenceItem[], item: AIEvidenceItem): AIEvidenceItem[] => [
  ...items.filter((existing) => existing.id !== item.id),
  item,
];

export const getEvidenceForStep = (items: AIEvidenceItem[], stepId: string): AIEvidenceItem[] => items.filter((item) => item.stepId === stepId);

export const getEvidenceByTool = (items: AIEvidenceItem[], toolName: string): AIEvidenceItem[] => items.filter((item) => item.sourceTool === toolName);

export const hasSuccessfulEvidenceFromTool = (items: AIEvidenceItem[], toolNames: string[]): boolean => items.some((item) => (
  item.confidence !== 'low'
  && item.sourceTool !== undefined
  && toolNames.includes(item.sourceTool)
  && item.contradicts.length === 0
));

export const createEvidenceFromPreflight = (params: {
  taskRunId: string;
  stepId?: string;
  result: AIPreflightToolResult;
}): AIEvidenceItem => ({
  id: createEvidenceId(),
  taskRunId: params.taskRunId,
  stepId: params.stepId,
  sourceTool: params.result.toolName,
  content: params.result.output ?? params.result.error,
  summary: params.result.observation?.summary || params.result.error || `${params.result.toolName} 执行完成`,
  confidence: params.result.observation?.confidence || 'low',
  supports: params.result.ok ? [params.result.toolName] : [],
  contradicts: params.result.ok ? [] : [params.result.toolName],
  createdAt: Date.now(),
});

export const createEvidenceFromCodeEvidence = (params: {
  taskRunId: string;
  stepId?: string;
  codeEvidence: AICodeEvidenceRunResult;
}): AIEvidenceItem[] => params.codeEvidence.results.map((result) => ({
  id: createEvidenceId(),
  taskRunId: params.taskRunId,
  stepId: params.stepId,
  sourceTool: result.toolName,
  content: result.output ?? result.error,
  summary: result.error || `${result.toolName} 代码证据收集${result.ok ? '成功' : '失败'}`,
  confidence: result.ok ? 'medium' : 'low',
  supports: result.ok ? ['code_evidence'] : [],
  contradicts: result.ok ? [] : ['code_evidence'],
  createdAt: Date.now(),
}));
