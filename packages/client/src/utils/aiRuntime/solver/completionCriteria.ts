import type { AITaskProfile } from './taskProfile';

export interface AITaskCompletionCriteria {
  mustHave: string[];
  shouldHave: string[];
  cannotClaimWithoutEvidence: string[];
  minimumDeliverable: string[];
}

export const buildAITaskCompletionCriteria = (profile: AITaskProfile): AITaskCompletionCriteria => {
  const mustHave: string[] = [];
  const shouldHave: string[] = [];
  const cannotClaimWithoutEvidence: string[] = [];
  const minimumDeliverable: string[] = ['说明已完成部分、未完成部分和下一步可继续动作'];

  if (profile.requiresFreshData) {
    mustHave.push('至少一个成功的外部信息来源，或明确说明无法获取最新数据');
    shouldHave.push('说明数据来源、时间或检索时间');
    cannotClaimWithoutEvidence.push('当前价格、最新状态、最近涨跌、最新政策、实时结论');
    minimumDeliverable.push('说明已尝试的数据获取路径和失败原因');
    minimumDeliverable.push('提供可继续检索的关键词、链接、截图或用户可补充的信息');
  }

  if (profile.requiresLocalContext) {
    mustHave.push('使用本地上下文或明确说明缺少本地路径/文件信息');
    cannotClaimWithoutEvidence.push('具体文件内容、项目实现细节、代码行为结论');
  }

  if (profile.requiresUserContext) {
    shouldHave.push('说明关键前提假设和适用场景');
    shouldHave.push('请求用户补充影响结论的个人/业务上下文');
    cannotClaimWithoutEvidence.push('确定性建议、保证性收益、唯一正确决策');
    minimumDeliverable.push('给出分场景建议，而不是单一确定性结论');
  }

  if (profile.outputExpectation.includes('document')) {
    mustHave.push('满足用户指定的文档主题、结构和格式');
    shouldHave.push('如需落盘，应保存到工作目录输出目录或说明未保存原因');
  }

  if (profile.outputExpectation.includes('comparison')) {
    shouldHave.push('给出可比较维度、差异点和结论边界');
  }

  if (profile.riskLevel === 'high') {
    mustHave.push('包含风险提示和非专业意见免责声明');
    cannotClaimWithoutEvidence.push('绝对化、保证性、无风险表述');
  }

  return {
    mustHave: Array.from(new Set(mustHave)),
    shouldHave: Array.from(new Set(shouldHave)),
    cannotClaimWithoutEvidence: Array.from(new Set(cannotClaimWithoutEvidence)),
    minimumDeliverable: Array.from(new Set(minimumDeliverable)),
  };
};

export const formatAITaskCompletionCriteriaPrompt = (criteria: AITaskCompletionCriteria): string => [
  '# Task completion criteria',
  criteria.mustHave.length ? `Must have:\n${criteria.mustHave.map((item) => `- ${item}`).join('\n')}` : undefined,
  criteria.shouldHave.length ? `Should have:\n${criteria.shouldHave.map((item) => `- ${item}`).join('\n')}` : undefined,
  criteria.cannotClaimWithoutEvidence.length ? `Cannot claim without evidence:\n${criteria.cannotClaimWithoutEvidence.map((item) => `- ${item}`).join('\n')}` : undefined,
  criteria.minimumDeliverable.length ? `Minimum deliverable if blocked/degraded:\n${criteria.minimumDeliverable.map((item) => `- ${item}`).join('\n')}` : undefined,
].filter(Boolean).join('\n\n');
