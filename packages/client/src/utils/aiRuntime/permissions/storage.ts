import type { AIPermissionRule } from './types';
import { createPermissionRule } from './rules';

const RULE_STORAGE_KEY = 'workgaga.ai.permission.rules.v1';

export const listAIPermissionRules = (): AIPermissionRule[] => {
  try {
    const raw = localStorage.getItem(RULE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as AIPermissionRule[] : [];
  } catch {
    return [];
  }
};

export const saveAIPermissionRules = (rules: AIPermissionRule[]): void => {
  localStorage.setItem(RULE_STORAGE_KEY, JSON.stringify(rules));
};

export const addAIPermissionRule = (rule: Omit<AIPermissionRule, 'id' | 'createdAt' | 'updatedAt'>): AIPermissionRule => {
  const nextRule = createPermissionRule(rule);
  saveAIPermissionRules([nextRule, ...listAIPermissionRules()]);
  return nextRule;
};

export const removeAIPermissionRule = (id: string): void => {
  saveAIPermissionRules(listAIPermissionRules().filter((rule) => rule.id !== id));
};

export const clearAIPermissionRules = (): void => {
  localStorage.removeItem(RULE_STORAGE_KEY);
};
