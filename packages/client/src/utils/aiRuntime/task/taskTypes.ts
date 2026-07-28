import type { AIProblemIntent, AIProblemPolicy } from '../solver';

export type AITaskRunStatus = 'pending' | 'running' | 'blocked' | 'recovering' | 'completed' | 'failed' | 'cancelled';

export type AITaskStepStatus = 'pending' | 'running' | 'blocked' | 'completed' | 'failed' | 'skipped';

export type AITaskRunMode = 'foreground' | 'background';

export type AITaskStepType =
  | 'analyze_goal'
  | 'collect_context'
  | 'run_required_tool'
  | 'fallback_search'
  | 'extract_evidence'
  | 'plan_change'
  | 'request_approval'
  | 'write_change'
  | 'run_verification'
  | 'finalize';

export interface AITaskStep {
  id: string;
  title: string;
  type: AITaskStepType;
  status: AITaskStepStatus;
  requiredEvidence: string[];
  preferredTools: string[];
  fallbackTools: string[];
  verificationCriteria: string[];
  dependsOn?: string[];
  startedAt?: number;
  completedAt?: number;
  failureReason?: string;
}

export interface AITaskToolActivity {
  toolName: string;
  summary: string;
  ok?: boolean;
  createdAt: number;
}

export interface AITaskRunProgress {
  currentStepId?: string;
  currentStepTitle?: string;
  completedStepCount: number;
  totalStepCount: number;
  toolUseCount: number;
  recoveryCount: number;
  recentActivities: AITaskToolActivity[];
  lastActivity?: AITaskToolActivity;
}

export interface AIEvidenceItem {
  id: string;
  taskRunId: string;
  stepId?: string;
  sourceTool?: string;
  sourceUrl?: string;
  content: unknown;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  supports: string[];
  contradicts: string[];
  createdAt: number;
}

export interface AITaskFailure {
  id: string;
  stepId?: string;
  reason: string;
  recoverable: boolean;
  createdAt: number;
}

export interface AITaskRecoveryRecord {
  stepId: string;
  failureId?: string;
  actionType: string;
  reason: string;
  createdAt: number;
}

export interface AITaskVerification {
  ok: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  checkedAt: number;
}

export interface AITaskRun {
  id: string;
  conversationId: string;
  assistantMessageId: string;
  goal: string;
  intent: AIProblemIntent;
  status: AITaskRunStatus;
  mode?: AITaskRunMode;
  policy?: AIProblemPolicy;
  steps: AITaskStep[];
  evidence: AIEvidenceItem[];
  failures: AITaskFailure[];
  recoveries: AITaskRecoveryRecord[];
  progress?: AITaskRunProgress;
  verification?: AITaskVerification;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export const isTerminalTaskRunStatus = (status: AITaskRunStatus): boolean => (
  status === 'completed' || status === 'failed' || status === 'cancelled'
);

export const isTerminalTaskStepStatus = (status: AITaskStepStatus): boolean => (
  status === 'completed' || status === 'failed' || status === 'skipped'
);

export const buildTaskRunProgress = (taskRun: AITaskRun): AITaskRunProgress => {
  const activeStep = taskRun.steps.find((step) => step.status === 'running' || step.status === 'blocked')
    || taskRun.steps.find((step) => step.status === 'pending');
  const recentActivities = taskRun.progress?.recentActivities ?? [];

  return {
    currentStepId: activeStep?.id,
    currentStepTitle: activeStep?.title,
    completedStepCount: taskRun.steps.filter((step) => step.status === 'completed' || step.status === 'skipped').length,
    totalStepCount: taskRun.steps.length,
    toolUseCount: taskRun.progress?.toolUseCount ?? taskRun.evidence.filter((item) => item.sourceTool).length,
    recoveryCount: taskRun.recoveries.length,
    recentActivities,
    lastActivity: recentActivities.length ? recentActivities[recentActivities.length - 1] : undefined,
  };
};
