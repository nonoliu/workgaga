import type { AIToolAuditLogEntry } from './types';

const AUDIT_STORAGE_KEY = 'workgaga.ai.tool.audit.v1';
const MAX_AUDIT_LOGS = 300;

const loadAuditLogs = (): AIToolAuditLogEntry[] => {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as AIToolAuditLogEntry[] : [];
  } catch {
    return [];
  }
};

export const listAIToolAuditLogs = (): AIToolAuditLogEntry[] => loadAuditLogs();

export const appendAIToolAuditLog = (entry: Omit<AIToolAuditLogEntry, 'id' | 'createdAt'>): AIToolAuditLogEntry => {
  const item: AIToolAuditLogEntry = {
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const logs = [item, ...loadAuditLogs()].slice(0, MAX_AUDIT_LOGS);
  localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
  return item;
};

export const clearAIToolAuditLogs = (): void => {
  localStorage.removeItem(AUDIT_STORAGE_KEY);
};
