import type { AIRuntimeWorkspaceContext } from '../workspace';

export type AIToolPermissionBehavior = 'allow' | 'deny' | 'ask' | 'passthrough';

export type AIToolJSONSchema = {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
};

export interface AIToolValidationResult<TInput> {
  ok: boolean;
  input?: TInput;
  message?: string;
}

export interface AIToolPermissionDecision {
  behavior: AIToolPermissionBehavior;
  message?: string;
  reason?: string;
  updatedInput?: unknown;
}

export interface AIToolPermissionRequestPayload {
  conversationId?: string;
  toolName: string;
  input: unknown;
  message: string;
  reason?: string;
}

export interface AIToolWritePreview {
  toolName: string;
  targetPaths: string[];
  preview: string;
}

export interface AIToolStructuredChangePlan {
  id: string;
  files: string[];
  reasons: string[];
  evidence: string[];
  verification: string[];
}

export interface AIToolWritePlanGuard {
  required: boolean;
  blockingTools: string[];
  assistantPlanText?: string;
  activePlan?: AIToolStructuredChangePlan;
  approvedPlanIds?: string[];
}

export interface AIToolContext {
  conversationId?: string;
  workspace?: AIRuntimeWorkspaceContext;
  permissionMode?: 'ask' | 'auto-read' | 'auto-write' | 'bypass';
  permissionRules?: import('../permissions').AIPermissionRule[];
  requestPermission?: (payload: AIToolPermissionRequestPayload) => Promise<'allow' | 'deny'> | 'allow' | 'deny';
  requestPlanApproval?: (plan: AIToolStructuredChangePlan, preview?: AIToolWritePreview) => Promise<'approved' | 'denied'> | 'approved' | 'denied';
  writePlanGuard?: AIToolWritePlanGuard;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface AIToolProgress {
  message: string;
}

export interface AIToolExecutionResult<TOutput = unknown> {
  output: TOutput;
  error?: string;
}

export interface AIToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  title: string;
  description: string;
  inputSchema: AIToolJSONSchema;
  readOnly: boolean;
  concurrencySafe: boolean;
  defaultPermission: AIToolPermissionBehavior;
  validate(input: unknown): AIToolValidationResult<TInput>;
  checkPermission(input: TInput, context: AIToolContext): Promise<AIToolPermissionDecision> | AIToolPermissionDecision;
  call(input: TInput, context: AIToolContext, onProgress: (progress: AIToolProgress) => void): Promise<TOutput>;
}

export interface AIToolCallRequest {
  id: string;
  name: string;
  input: unknown;
}

export interface AIToolCallExecutionResult {
  callId: string;
  name: string;
  output: unknown;
  error?: string;
}
