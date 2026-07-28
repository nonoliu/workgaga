import type { AIAgentDefinition, AIAgentRouteInput, AIAgentRouteResult } from './types';

const hasAgent = (agents: AIAgentDefinition[], type: string): boolean => agents.some((agent) => agent.type === type);

const pickAvailable = (agents: AIAgentDefinition[], candidates: string[]): string | undefined => candidates.find((type) => hasAgent(agents, type));

const includesAny = (text: string, patterns: RegExp[]): boolean => patterns.some((pattern) => pattern.test(text));

const implementationPatterns = [
  /实现|修改|修复|重构|添加|接入|排查|改代码|落地|执行/,
  /implement|modify|fix|refactor|add|integrate|debug|execute/,
];

const guidePatterns = [
  /claude code|agent sdk|claude api|anthropic api|mcp|hooks|skills|subagents?|slash command|settings\.json/,
  /子\s*agent|钩子|技能|斜杠命令|配置|runtime|运行时/,
];

const planPatterns = [
  /方案|计划|设计|架构|怎么改|改造方案|先输出|确认后|评审方案/,
  /plan|design|architecture|proposal|approach|before implementation/,
];

const explorePatterns = [
  /学习一下|梳理|分析|有哪些|在哪里|调用链|源码|机制|搜索|定位|查找|研究|只读/,
  /explore|investigate|search|find|locate|trace|call chain|how does|where is|read-only/,
];

const verifyPatterns = [
  /验证|测试|回归|确认结果|确认是否通过|验收/,
  /verify|test|regression|validate|acceptance/,
];

const createResult = (agentType: string, reason: string, confidence: number): AIAgentRouteResult => ({
  agentType,
  reason,
  confidence,
});

export const routeAIAgent = ({
  prompt,
  explicitAgentType,
  availableAgents,
  runtimeMode = 'normal',
}: AIAgentRouteInput): AIAgentRouteResult => {
  if (explicitAgentType && hasAgent(availableAgents, explicitAgentType)) {
    return createResult(explicitAgentType, '显式指定 agent。', 1);
  }

  const text = prompt.toLowerCase();
  const guideAgent = pickAvailable(availableAgents, ['runtime-guide', 'claude-code-guide']);
  if (guideAgent && includesAny(text, guidePatterns)) {
    return createResult(guideAgent, '命中 runtime/Claude Code/agent 配置咨询。', 0.86);
  }

  if (runtimeMode === 'fork') {
    const fallback = pickAvailable(availableAgents, ['general-purpose']) ?? availableAgents[0]?.type;
    return createResult(fallback, 'fork 模式下保留父上下文语义，仅使用通用兜底。', 0.45);
  }

  const isImplementation = includesAny(text, implementationPatterns);

  const verifier = pickAvailable(availableAgents, ['verifier', 'verification']);
  if (verifier && includesAny(text, verifyPatterns)) {
    return createResult(verifier, '命中验证/测试任务。', 0.78);
  }

  const plan = pickAvailable(availableAgents, ['plan', 'Plan']);
  if (plan && includesAny(text, planPatterns) && !isImplementation) {
    return createResult(plan, '命中方案设计或确认后执行任务。', 0.8);
  }

  const explore = pickAvailable(availableAgents, ['explore', 'Explore']);
  if (explore && includesAny(text, explorePatterns) && !isImplementation) {
    return createResult(explore, '命中只读探索或源码梳理任务。', 0.8);
  }

  const general = pickAvailable(availableAgents, ['general-purpose']) ?? availableAgents[0]?.type;
  return createResult(general, '未命中特定 agent，使用通用 agent。', 0.5);
};
