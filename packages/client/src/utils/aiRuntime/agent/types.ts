import type { AIModelProvider } from '../llmTypes';
import type { AIRuntimeEvent, AIRuntimeMessage } from '../types';
import type { AIRuntimeWorkspaceContext } from '../workspace';
import type { AIToolContext, AIToolDefinition } from '../tools';
import type { AIProblemIntent } from '../solver';

export type AIAgentMode = 'read-only' | 'plan' | 'execute' | 'verify';

export type AIAgentSource = 'built-in' | 'project' | 'user' | 'plugin';

export type AIAgentRunStatus = 'completed' | 'failed' | 'cancelled' | 'timeout';

export type AIAgentPermissionMode = 'ask' | 'auto-read' | 'auto-write' | 'bypass';

export interface AIAgentDefinition {
  type: string;
  displayName?: string;
  description: string;
  whenToUse?: string;
  systemPrompt: string | (() => string);
  tools?: string[];
  disallowedTools?: string[];
  model?: string | 'inherit';
  mode?: AIAgentMode;
  permissionMode?: AIAgentPermissionMode;
  background?: boolean;
  maxTurns?: number;
  timeoutMs?: number;
  priority?: number;
  source?: AIAgentSource;
}

export interface AIAgentRouteInput {
  prompt: string;
  explicitAgentType?: string;
  availableAgents: AIAgentDefinition[];
  runtimeMode?: 'normal' | 'fork' | 'background';
}

export interface AIAgentRouteResult {
  agentType: string;
  reason: string;
  confidence: number;
}

export interface AIAgentRunContext {
  runId: string;
  parentRunId?: string;
  agentType: string;
  cwd?: string;
  workspace?: AIRuntimeWorkspaceContext;
  mode: AIAgentMode;
  toolContext?: AIToolContext;
  metadata?: Record<string, unknown>;
}

export type AIAgentExecutor = (input: AIAgentExecuteInput) => Promise<AIAgentExecuteResult> | AsyncIterable<AIRuntimeEvent>;

export interface AIAgentRunInput {
  agent: AIAgentDefinition;
  messages: AIRuntimeMessage[];
  tools?: AIToolDefinition[];
  context?: Partial<AIAgentRunContext>;
  provider?: AIModelProvider;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  maxToolRounds?: number;
  intent?: AIProblemIntent;
  signal?: AbortSignal;
  timeoutMs?: number;
  background?: boolean;
  execute?: AIAgentExecutor;
}

export interface AIAgentExecuteInput {
  agent: AIAgentDefinition;
  messages: AIRuntimeMessage[];
  tools: AIToolDefinition[];
  context: AIAgentRunContext;
  signal: AbortSignal;
}

export interface AIAgentExecuteResult {
  messages?: AIRuntimeMessage[];
  outputText?: string;
  events?: AIRuntimeEvent[];
}

export interface AIAgentRunResult {
  agentRunId: string;
  agentType: string;
  status: AIAgentRunStatus;
  messages: AIRuntimeMessage[];
  outputText: string;
  error?: string;
  events: AIRuntimeEvent[];
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

export type AIAgentRuntimeEvent =
  | { type: 'agent_start'; agentRunId: string; agentType: string }
  | { type: 'agent_complete'; result: AIAgentRunResult }
  | { type: 'agent_error'; agentRunId: string; agentType: string; error: string }
  | AIRuntimeEvent;
