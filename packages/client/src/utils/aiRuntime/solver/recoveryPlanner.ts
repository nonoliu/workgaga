import type { AIEvidencePlan } from './evidencePlan';
import type { AITaskCompletionCriteria } from './completionCriteria';
import type { AITaskProfile } from './taskProfile';
import type { AIIntentDetectionResult, AIProblemPolicy, AIPreflightToolResult } from './types';
import { buildFallbackToolInput } from './fallbackChain';

export type AIRecoveryAction =
  | { type: 'retry_tool'; toolName: string; input: Record<string, unknown>; reason: string }
  | { type: 'alternate_tool'; toolName: string; input: Record<string, unknown>; reason: string }
  | { type: 'rewrite_query'; toolName: string; input: Record<string, unknown>; reason: string }
  | { type: 'ask_user'; question: string; reason: string }
  | { type: 'use_available_context'; reason: string }
  | { type: 'produce_template'; reason: string; template: string }
  | { type: 'degraded_answer'; reason: string; userActions: string[] };

const buildRewriteQueries = (input: string): string[] =>
  [`${input} 最新`, `${input} 官方`, `${input} 数据 来源`, `${input} 2026`].filter(
    (query, index, list) => query.trim().length >= 2 && list.indexOf(query) === index,
  );

export const planRecoveryActions = (params: {
  detection: AIIntentDetectionResult;
  policy: AIProblemPolicy;
  taskProfile?: AITaskProfile;
  completionCriteria?: AITaskCompletionCriteria;
  evidencePlan?: AIEvidencePlan;
  missingEvidenceKeys?: string[];
  failedResult: AIPreflightToolResult;
  previousResults: AIPreflightToolResult[];
  userInput: string;
}): AIRecoveryAction[] => {
  const attempted = new Set(params.previousResults.map((result) => result.toolName));
  const actions: AIRecoveryAction[] = [];

  const missingEvidenceKeys = new Set(params.missingEvidenceKeys ?? []);
  const missingExternalEvidence =
    missingEvidenceKeys.has('external_evidence') ||
    params.taskProfile?.requiresFreshData ||
    params.taskProfile?.requiresExternalEvidence;
  const missingLocalContext = missingEvidenceKeys.has('local_context') || params.taskProfile?.requiresLocalContext;
  const missingUserContext = missingEvidenceKeys.has('user_context') || params.taskProfile?.requiresUserContext;

  if (missingExternalEvidence) {
    actions.push({
      type: 'rewrite_query',
      toolName: 'web-search',
      input: {
        query: params.userInput,
        alternateQueries: buildRewriteQueries(params.userInput),
        domainHints: ['官方', '新闻', '数据来源'],
        maxResults: 5,
      },
      reason: '外部证据缺失，改写查询并尝试更多通用来源。',
    });
  }

  if (missingLocalContext && !attempted.has('search-knowledge')) {
    actions.push({
      type: 'use_available_context',
      reason: '本地上下文缺失，应优先使用已提供上下文；如仍不足，应请求用户补充路径或关键词。',
    });
  }

  if (missingLocalContext && params.taskProfile?.outputExpectation.includes('document') && !missingExternalEvidence) {
    actions.push({
      type: 'ask_user',
      question:
        '为了生成更准确的日报/总结，请补充你今天的工作要点（完成/进行中/问题/明日计划），或指出相关文件/目录/笔记位置。',
      reason: '本地上下文不足，无法可靠还原用户当天工作内容。',
    });
  }

  if (params.taskProfile?.outputExpectation.includes('document')) {
    actions.push({
      type: 'produce_template',
      reason: '如果证据不足，仍可先产出可补全的文档模板。',
      template: '## 已知信息\n\n## 缺失信息\n\n## 待补充来源\n\n## 初稿\n',
    });
  }

  params.policy.fallbackTools.forEach((toolName) => {
    if (attempted.has(toolName)) return;
    const input = buildFallbackToolInput({
      toolName,
      userInput: params.userInput,
      detection: params.detection,
      previousOutput: params.failedResult.output,
    });
    if (input) {
      actions.push({
        type: 'alternate_tool',
        toolName,
        input,
        reason: `${params.failedResult.toolName} 失败后尝试 fallback 工具 ${toolName}`,
      });
    }
  });

  if (missingUserContext && !missingExternalEvidence && !missingLocalContext) {
    actions.push({
      type: 'ask_user',
      question: '为了给出更具体可靠的建议，请补充你的目标、约束、时间范围、风险偏好或当前已有数据。',
      reason: '建议类任务缺少用户上下文，不能给出过度确定的单一结论。',
    });
  }

  if (params.policy.degradedAnswerAllowed) {
    actions.push({
      type: 'degraded_answer',
      reason: params.failedResult.error || `${params.failedResult.toolName} 未获得可用结果`,
      userActions: params.policy.minimumDeliverable ?? ['说明已尝试工具、失败原因和可继续操作路径'],
    });
  }

  return actions;
};
