import type { AIEvidenceItem, AITaskFailure, AITaskRun, AITaskStep } from './taskTypes';

export type AITaskRecoveryActionType =
  | 'retry_same_tool'
  | 'alternate_tool'
  | 'rewrite_query'
  | 'fetch_next_url'
  | 'ask_user'
  | 'partial_completion'
  | 'abort_task';

export interface AITaskRecoveryAction {
  type: AITaskRecoveryActionType;
  reason: string;
  toolName?: string;
  query?: string;
  message?: string;
  recoverable: boolean;
}

export interface AITaskRecoveryDecision {
  taskRunId: string;
  stepId: string;
  failureId?: string;
  actions: AITaskRecoveryAction[];
  selectedAction: AITaskRecoveryAction;
  createdAt: number;
}

const hasEvidenceFromTool = (evidence: AIEvidenceItem[], toolName: string): boolean => evidence.some((item) => item.sourceTool === toolName);

export const recoverTaskStepFailure = (params: {
  taskRun: AITaskRun;
  step: AITaskStep;
  failure?: AITaskFailure;
  evidence: AIEvidenceItem[];
  availableTools: string[];
}): AITaskRecoveryDecision => {
  const actions: AITaskRecoveryAction[] = [];
  const reason = params.failure?.reason || params.step.failureReason || '步骤执行失败。';

  if (params.step.type === 'run_required_tool') {
    if (params.taskRun.intent === 'weather_query') {
      if (params.availableTools.includes('web-search')) {
        actions.push({
          type: 'rewrite_query',
          toolName: 'web-search',
          query: `${params.taskRun.goal} 官方 天气预报`,
          reason: '天气主工具失败，改写查询并搜索可信来源。',
          recoverable: true,
        });
      }
      if (params.availableTools.includes('web-fetch') && hasEvidenceFromTool(params.evidence, 'web-search')) {
        actions.push({
          type: 'fetch_next_url',
          toolName: 'web-fetch',
          reason: '已有搜索结果，尝试抓取下一个候选 URL。',
          recoverable: true,
        });
      }
    }

    if (params.availableTools.includes('web-search')) {
      actions.push({
        type: 'alternate_tool',
        toolName: 'web-search',
        reason: '必要工具失败，尝试搜索类备用工具。',
        recoverable: true,
      });
    }
  }

  if (params.step.type === 'collect_context') {
    if (params.availableTools.includes('search-files')) {
      actions.push({
        type: 'rewrite_query',
        toolName: 'search-files',
        query: params.taskRun.goal.slice(0, 80),
        reason: '代码上下文不足，改写关键词重新搜索。',
        recoverable: true,
      });
    }
    actions.push({
      type: 'ask_user',
      message: '请提供相关文件路径、项目目录，或在 IDE 中打开相关文件。',
      reason: '缺少足够代码上下文，需用户补充路径信息。',
      recoverable: true,
    });
  }

  if (!actions.length && params.failure?.recoverable === false) {
    actions.push({
      type: 'abort_task',
      reason,
      recoverable: false,
    });
  }

  if (!actions.length) {
    actions.push({
      type: 'partial_completion',
      reason: '没有可用自动恢复动作，允许基于当前证据进行部分交付并说明限制。',
      recoverable: true,
    });
  }

  return {
    taskRunId: params.taskRun.id,
    stepId: params.step.id,
    failureId: params.failure?.id,
    actions,
    selectedAction: actions[0],
    createdAt: Date.now(),
  };
};
