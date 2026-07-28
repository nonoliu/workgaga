import type { AIPermissionResourceKind, AIPermissionRule } from './types';

export const createPermissionRuleId = (): string => `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const normalizePermissionPattern = (pattern: string): string => pattern.trim().toLowerCase();

const wildcardToRegExp = (pattern: string): RegExp => {
  const escaped = normalizePermissionPattern(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
};

export const matchPermissionPattern = (pattern: string, resource: string): boolean => {
  const normalizedPattern = normalizePermissionPattern(pattern);
  const normalizedResource = resource.trim().toLowerCase();
  if (!normalizedPattern || !normalizedResource) return false;
  if (normalizedPattern === '*') return true;
  if (normalizedPattern.includes('*')) return wildcardToRegExp(normalizedPattern).test(normalizedResource);
  return normalizedPattern === normalizedResource;
};

export const findPermissionRule = (
  rules: AIPermissionRule[] = [],
  resourceKind: AIPermissionResourceKind,
  resource: string,
  toolName?: string,
): AIPermissionRule | undefined => rules.find((rule) => {
  if (rule.resourceKind !== resourceKind) return false;
  if (rule.toolName && toolName && rule.toolName !== toolName) return false;
  if (rule.toolName && !toolName) return false;
  return matchPermissionPattern(rule.pattern, resource);
});

export const createPermissionRule = (rule: Omit<AIPermissionRule, 'id' | 'createdAt' | 'updatedAt'>): AIPermissionRule => {
  const now = Date.now();
  return {
    ...rule,
    id: createPermissionRuleId(),
    createdAt: now,
    updatedAt: now,
  };
};
