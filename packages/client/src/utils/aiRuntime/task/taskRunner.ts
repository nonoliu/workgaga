import type { AIRuntimeEvent } from '../types';
import type { AIToolContext, AIToolRegistry } from '../tools';
import type { AICodeEvidenceRunResult, AIEvidencePlan, AIIntentDetectionResult, AIProblemPolicy, AIPreflightRunResult, AITaskCompletionCriteria, AITaskProfile } from '../solver';
import { recoverTaskStepFailure } from './taskRecovery';
import { executeTaskStep, type AITaskStepExecutionResult } from './taskStepExecutor';
import { buildTaskRunProgress, isTerminalTaskRunStatus, type AIEvidenceItem, type AITaskFailure, type AITaskRecoveryRecord, type AITaskRun, type AITaskStep, type AITaskToolActivity } from './taskTypes';

export type AITaskRunnerEvent =
  | { type: 'task_updated'; taskRun: AITaskRun }
  | { type: 'step_started'; taskRun: AITaskRun; step: AITaskStep }
  | { type: 'step_completed'; taskRun: AITaskRun; step: AITaskStep; result: AITaskStepExecutionResult }
  | { type: 'step_blocked'; taskRun: AITaskRun; step: AITaskStep; failures: AITaskFailure[] }
  | { type: 'recovery_selected'; taskRun: AITaskRun; recovery: AITaskRecoveryRecord }
  | { type: 'runtime_event'; event: AIRuntimeEvent };

export interface AITaskRunnerResult {
  taskRun: AITaskRun;
  preflight?: AIPreflightRunResult;
  codeEvidence?: AICodeEvidenceRunResult;
}

export interface RunAutonomousTaskInput {
  taskRun: AITaskRun;
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
  executableStepTypes?: AITaskStep['type'][];
  maxRecoveryActions?: number;
  onEvent?: (event: AITaskRunnerEvent) => void;
}

const DEFAULT_EXECUTABLE_STEP_TYPES: AITaskStep['type'][] = ['analyze_goal', 'run_required_tool', 'collect_context'];
const MAX_RECENT_ACTIVITIES = 5;

const now = () => Date.now();

const addActivity = (taskRun: AITaskRun, activity: AITaskToolActivity): AITaskRun => {
  const recentActivities = [...(taskRun.progress?.recentActivities ?? []), activity].slice(-MAX_RECENT_ACTIVITIES);
  return {
    ...taskRun,
    progress: buildTaskRunProgress({
      ...taskRun,
      progress: {
        ...buildTaskRunProgress(taskRun),
        recentActivities,
        toolUseCount: (taskRun.progress?.toolUseCount ?? taskRun.evidence.filter((item) => item.sourceTool).length) + 1,
      },
    }),
  };
};

const refreshProgress = (taskRun: AITaskRun): AITaskRun => ({
  ...taskRun,
  progress: buildTaskRunProgress(taskRun),
  updatedAt: now(),
});

const setStep = (taskRun: AITaskRun, step: AITaskStep): AITaskRun => refreshProgress({
  ...taskRun,
  steps: taskRun.steps.map((item) => (item.id === step.id ? step : item)),
});

const mergeExecutionResult = (taskRun: AITaskRun, result: AITaskStepExecutionResult): AITaskRun => refreshProgress({
  ...taskRun,
  steps: taskRun.steps.map((step) => (step.id === result.step.id ? result.step : step)),
  evidence: mergeEvidence(taskRun.evidence, result.evidence),
  failures: [...taskRun.failures, ...result.failures],
});

const mergeEvidence = (current: AIEvidenceItem[], next: AIEvidenceItem[]): AIEvidenceItem[] => {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !ids.has(item.id))];
};

const dependenciesComplete = (taskRun: AITaskRun, step: AITaskStep): boolean => {
  if (!step.dependsOn?.length) return true;
  const byId = new Map(taskRun.steps.map((item) => [item.id, item]));
  return step.dependsOn.every((id) => byId.get(id)?.status === 'completed' || byId.get(id)?.status === 'skipped');
};

const markSkipped = (step: AITaskStep): AITaskStep => ({
  ...step,
  status: step.status === 'pending' ? 'skipped' : step.status,
  completedAt: step.completedAt ?? now(),
});

export const runAutonomousTask = async (input: RunAutonomousTaskInput): Promise<AITaskRunnerResult> => {
  const executableStepTypes = new Set(input.executableStepTypes ?? DEFAULT_EXECUTABLE_STEP_TYPES);
  let taskRun = refreshProgress({ ...input.taskRun, status: 'running' });
  let preflight: AIPreflightRunResult | undefined;
  let codeEvidence: AICodeEvidenceRunResult | undefined;
  let recoveryCount = 0;

  const emit = (event: AITaskRunnerEvent) => input.onEvent?.(event);
  emit({ type: 'task_updated', taskRun });

  for (const originalStep of taskRun.steps) {
    if (input.context?.signal?.aborted) {
      taskRun = refreshProgress({ ...taskRun, status: 'cancelled', completedAt: now() });
      emit({ type: 'task_updated', taskRun });
      break;
    }

    const currentStep = taskRun.steps.find((step) => step.id === originalStep.id) ?? originalStep;
    if (currentStep.status !== 'pending') continue;
    if (!dependenciesComplete(taskRun, currentStep)) continue;

    if (!executableStepTypes.has(currentStep.type)) {
      taskRun = setStep(taskRun, markSkipped(currentStep));
      emit({ type: 'task_updated', taskRun });
      continue;
    }

    const runningStep: AITaskStep = { ...currentStep, status: 'running', startedAt: currentStep.startedAt ?? now() };
    taskRun = setStep(taskRun, runningStep);
    emit({ type: 'step_started', taskRun, step: runningStep });

    const result = await executeTaskStep({
      taskRun,
      step: runningStep,
      userInput: input.userInput,
      detection: input.detection,
      policy: input.policy,
      taskProfile: input.taskProfile,
      completionCriteria: input.completionCriteria,
      evidencePlan: input.evidencePlan,
      registry: input.registry,
      allowedToolNames: input.allowedToolNames,
      context: input.context,
      currentFileName: input.currentFileName,
      emit: (event) => {
        if (event.type === 'tool_call_result') {
          taskRun = addActivity(taskRun, {
            toolName: event.result.name,
            summary: event.result.error || `${event.result.name} 执行完成`,
            ok: !event.result.error,
            createdAt: now(),
          });
        }
        emit({ type: 'runtime_event', event });
      },
    });

    preflight = result.preflight ?? preflight;
    codeEvidence = result.codeEvidence ?? codeEvidence;
    taskRun = mergeExecutionResult(taskRun, result);

    if (result.failures.length) {
      const recoveryRecords = result.failures.map((failure) => {
        const decision = recoverTaskStepFailure({
          taskRun,
          step: result.step,
          failure,
          evidence: taskRun.evidence,
          availableTools: input.allowedToolNames,
        });
        return {
          stepId: decision.stepId,
          failureId: decision.failureId,
          actionType: decision.selectedAction.type,
          reason: decision.selectedAction.reason,
          createdAt: decision.createdAt,
        } satisfies AITaskRecoveryRecord;
      });
      recoveryCount += recoveryRecords.length;
      taskRun = refreshProgress({
        ...taskRun,
        status: recoveryRecords.some((record) => record.actionType === 'abort_task') ? 'failed' : 'recovering',
        recoveries: [...taskRun.recoveries, ...recoveryRecords],
      });
      recoveryRecords.forEach((recovery) => emit({ type: 'recovery_selected', taskRun, recovery }));
      emit({ type: 'step_blocked', taskRun, step: result.step, failures: result.failures });

      if (recoveryCount >= (input.maxRecoveryActions ?? 3) || isTerminalTaskRunStatus(taskRun.status)) {
        taskRun = refreshProgress({ ...taskRun, status: taskRun.status === 'failed' ? 'failed' : 'blocked' });
        emit({ type: 'task_updated', taskRun });
        break;
      }
    } else {
      taskRun = refreshProgress({ ...taskRun, status: 'running' });
      emit({ type: 'step_completed', taskRun, step: result.step, result });
    }
  }

  if (!isTerminalTaskRunStatus(taskRun.status) && taskRun.status !== 'blocked') {
    taskRun = refreshProgress({ ...taskRun, status: 'running' });
  }

  emit({ type: 'task_updated', taskRun });
  return { taskRun, preflight, codeEvidence };
};
