import type { AIToolDefinition, AIToolPermissionBehavior } from '../tools';

export type AIPermissionResourceKind = 'tool' | 'domain' | 'path' | 'action' | 'command' | 'mcp';

export interface AIPermissionRule {
  id: string;
  behavior: AIToolPermissionBehavior;
  resourceKind: AIPermissionResourceKind;
  pattern: string;
  toolName?: string;
  createdAt: number;
  updatedAt: number;
  reason?: string;
}

export interface AIPermissionSuggestion {
  label: string;
  rule: Omit<AIPermissionRule, 'id' | 'createdAt' | 'updatedAt'>;
}

export interface AIPermissionRequest {
  id: string;
  toolName: string;
  toolTitle: string;
  resourceKind: AIPermissionResourceKind;
  resource: string;
  message: string;
  inputPreview: string;
  suggestions: AIPermissionSuggestion[];
  createdAt: number;
}

export interface AIPermissionDecision {
  behavior: AIToolPermissionBehavior;
  message?: string;
  reason?: string;
  request?: AIPermissionRequest;
  updatedInput?: unknown;
}

export interface AIPermissionContext {
  conversationId?: string;
  permissionMode?: 'ask' | 'auto-read' | 'auto-write' | 'bypass';
  rules?: AIPermissionRule[];
}

export interface AIPermissionCheckInput {
  tool: AIToolDefinition;
  input: unknown;
  context?: AIPermissionContext;
}

export interface AIToolAuditLogEntry {
  id: string;
  toolName: string;
  behavior: AIToolPermissionBehavior;
  resourceKind: AIPermissionResourceKind;
  resource: string;
  reason?: string;
  conversationId?: string;
  createdAt: number;
}
