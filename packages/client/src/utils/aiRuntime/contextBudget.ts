import type { AIRuntimeMessage } from './types';

export interface ContextBudgetOptions {
  maxChars: number;
  keepRecent?: number;
  summary?: string;
}

export interface ContextBudgetResult {
  messages: AIRuntimeMessage[];
  truncatedCount: number;
  estimatedChars: number;
}

const estimateChars = (messages: AIRuntimeMessage[]): number => messages.reduce((sum, item) => sum + item.content.length, 0);

export const applyContextBudget = (messages: AIRuntimeMessage[], options: ContextBudgetOptions): ContextBudgetResult => {
  const keepRecent = options.keepRecent ?? 8;
  const estimated = estimateChars(messages);
  if (estimated <= options.maxChars) {
    return { messages, truncatedCount: 0, estimatedChars: estimated };
  }

  const recent = messages.slice(-keepRecent);
  const truncatedCount = Math.max(0, messages.length - recent.length);
  const summaryMessage: AIRuntimeMessage | null = options.summary
    ? { role: 'system', content: `以下是较早对话摘要：\n${options.summary}`, status: 'completed', createdAt: Date.now() }
    : null;
  const nextMessages = summaryMessage ? [summaryMessage, ...recent] : recent;

  return {
    messages: nextMessages,
    truncatedCount,
    estimatedChars: estimateChars(nextMessages),
  };
};

export const shouldAutoCompact = (messages: AIRuntimeMessage[], maxChars: number): boolean => estimateChars(messages) > maxChars;
