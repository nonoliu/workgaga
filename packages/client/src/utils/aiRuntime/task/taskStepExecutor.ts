import type { AIRuntimeEvent } from '../types';
import type { AIToolContext, AIToolRegistry } from '../tools';
import { collectCodeEvidence, runPreflightTools } from '../solver';
import type { AICodeEvidenceRunResult, AIEvidencePlan, AIIntentDetectionResult, AIProblemPolicy, AIPreflightRunResult, AITaskCompletionCriteria, AITaskProfile } from '../solver';
import { createEvidenceFromCodeEvidence, createEvidenceFromPreflight } from './taskEvidence';
import type { AIEvidenceItem, AITaskFailure, AITaskRun, AITaskStep } from './taskTypes';

export interface AITaskStepExecutionResult {
  step: AITaskStep;
  evidence: AIEvidenceItem[];
  failures: AITaskFailure[];
  preflight?: AIPreflightRunResult;
  codeEvidence?: AICodeEvidenceRunResult;
}

const createFailure = (params: {
  stepId: string;
  reason: string;
  recoverable?: boolean;
}): AITaskFailure => ({
  id: `failure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  stepId: params.stepId,
  reason: params.reason,
  recoverable: params.recoverable ?? true,
  createdAt: Date.now(),
});

const completeStep = (step: AITaskStep): AITaskStep => ({
  ...step,
  status: 'completed',
  startedAt: step.startedAt ?? Date.now(),
  completedAt: Date.now(),
});

const blockStep = (step: AITaskStep, reason: string): AITaskStep => ({
  ...step,
  status: 'blocked',
  startedAt: step.startedAt ?? Date.now(),
  completedAt: Date.now(),
  failureReason: reason,
});

export const executeTaskStep = async (params: {
  taskRun: AITaskRun;
  step: AITaskStep;
  userInput: string;
  detection: AIIntentDetectionResult;
  policy: AIProblemPolicy;
  taskProfile?: AITaskProfile;
  completionCriteria?: AITaskCompletionCriteria;
  evidencePlan?: AIEvidencePlan;
  registry: AIToolRegistry;
  allowedToolNames: string[];
  context?: AIToolContext;
  currentFileName?: string;
  emit?: (event: AIRuntimeEvent) => void;
}): Promise<AITaskStepExecutionResult> => {
  if (params.context?.signal?.aborted) {
    const failure = createFailure({ stepId: params.step.id, reason: '运行已取消。', recoverable: false });
    return { step: blockStep(params.step, failure.reason), evidence: [], failures: [failure] };
  }

  switch (params.step.type) {
    case 'analyze_goal':
      return { step: completeStep(params.step), evidence: [], failures: [] };

    case 'run_required_tool': {
      const preflight = await runPreflightTools({
        userInput: params.userInput,
        detection: params.detection,
        policy: params.policy,
        taskProfile: params.taskProfile,
        completionCriteria: params.completionCriteria,
        evidencePlan: params.evidencePlan,
        registry: params.registry,
        allowedToolNames: params.allowedToolNames,
        context: params.context,
        emit: params.emit,
      });
      const evidence = preflight.results.map((result) => createEvidenceFromPreflight({
        taskRunId: params.taskRun.id,
        stepId: params.step.id,
        result,
      }));
      const ok = preflight.results.some((result) => result.ok);
      if (!ok && preflight.results.length) {
        const failure = createFailure({ stepId: params.step.id, reason: '必要工具没有产出可用证据。' });
        return { step: blockStep(params.step, failure.reason), evidence, failures: [failure], preflight };
      }
      return { step: completeStep(params.step), evidence, failures: [], preflight };
    }

    case 'collect_context': {
      const codeEvidence = await collectCodeEvidence({
        userInput: params.userInput,
        detection: params.detection,
        registry: params.registry,
        allowedToolNames: params.allowedToolNames,
        context: params.context,
        currentFileName: params.currentFileName,
        emit: params.emit,
      });
      const evidence = createEvidenceFromCodeEvidence({
        taskRunId: params.taskRun.id,
        stepId: params.step.id,
        codeEvidence,
      });
      if (codeEvidence.attempted && !codeEvidence.ok) {
        const failure = createFailure({ stepId: params.step.id, reason: '上下文证据不足。' });
        return { step: blockStep(params.step, failure.reason), evidence, failures: [failure], codeEvidence };
      }
      return { step: completeStep(params.step), evidence, failures: [], codeEvidence };
    }

    case 'fallback_search':
    case 'extract_evidence':
    case 'plan_change':
    case 'request_approval':
    case 'write_change':
    case 'run_verification':
    case 'finalize':
    default:
      return { step: { ...params.step, status: params.step.status === 'pending' ? 'skipped' : params.step.status }, evidence: [], failures: [] };
  }
};
