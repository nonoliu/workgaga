import type { AIToolStructuredChangePlan } from './tools';

export type AIRuntimeRole = 'system' | 'user' | 'assistant' | 'tool';

export type AIRuntimeMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed';

export interface AIRuntimeMessage {
  id?: string;
  role: AIRuntimeRole;
  content: string;
  status?: AIRuntimeMessageStatus;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

export interface AIRuntimeToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface AIRuntimeToolResult {
  callId: string;
  name: string;
  output: unknown;
  error?: string;
}

export type AIRuntimeEvent =
  | { type: 'assistant_delta'; content: string }
  | { type: 'assistant_message'; content: string }
  | { type: 'tool_call_start'; call: AIRuntimeToolCall }
  | { type: 'tool_call_progress'; callId: string; message: string }
  | { type: 'tool_call_result'; result: AIRuntimeToolResult }
  | { type: 'change_plan_detected'; plan: AIToolStructuredChangePlan }
  | { type: 'post_write_verification'; toolName: string; ok: boolean; summary: string }
  | { type: 'error'; error: string };

export interface AIRuntimeTrace {
  id: string;
  conversationId?: string;
  startedAt: number;
  completedAt?: number;
  events: AIRuntimeEvent[];
}
