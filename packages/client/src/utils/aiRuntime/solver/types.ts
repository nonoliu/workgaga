export type AIProblemIntent =
  | 'weather_query'
  | 'realtime_query'
  | 'web_research'
  | 'url_reading'
  | 'knowledge_lookup'
  | 'document_generation'
  | 'todo_planning'
  | 'schedule_planning'
  | 'code_understanding'
  | 'code_modification'
  | 'troubleshooting'
  | 'comparison_analysis'
  | 'data_extraction'
  | 'general_reasoning'
  | 'general_chat';

export interface AIIntentDetectionResult {
  intent: AIProblemIntent;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  entities?: Record<string, string>;
}

export interface AIProblemPolicy {
  intent: AIProblemIntent;
  requiredTools: string[];
  preferredTools: string[];
  fallbackTools: string[];
  directAnswerAllowed: boolean;
  verificationRequired: boolean;
  instructions: string[];
  completionCriteria?: string[];
  minimumDeliverable?: string[];
  degradedAnswerAllowed?: boolean;
  recoveryInstructions?: string[];
  maxRecoveryAttempts?: number;
}

export interface AIToolObservation {
  ok: boolean;
  confidence: 'high' | 'medium' | 'low';
  shouldRetry: boolean;
  fallbackToolNames: string[];
  summary: string;
  reason?: string;
}

export interface AIPreflightToolResult {
  toolName: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  observation?: AIToolObservation;
  fallbackOf?: string;
}

export interface AIPreflightRunResult {
  results: AIPreflightToolResult[];
  injectedContext: string;
  recoveryActions?: string[];
  degraded?: boolean;
  degradedReason?: string;
  satisfiedEvidence?: string[];
  missingEvidence?: string[];
  missingEvidenceKeys?: string[];
  recoveryRounds?: number;
  sourceCandidates?: string[];
  evidenceAttempts?: string[];
}

export interface AICodeEvidenceRunResult {
  attempted: boolean;
  ok: boolean;
  directory?: string;
  query?: string;
  evidenceContext: string;
  results: AIPreflightToolResult[];
}

export interface AICodeChangePlanGate {
  required: boolean;
  blockingTools: string[];
  evidenceReady: boolean;
  instructions: string[];
  context: string;
}

export type AIFinalAnswerVerificationStatus = 'ready' | 'degraded' | 'blocked';

export interface AIFinalAnswerVerification {
  status: AIFinalAnswerVerificationStatus;
  ok: boolean;
  confidence: 'high' | 'medium' | 'low';
  blocking: boolean;
  reasons: string[];
  requiredEvidence: string[];
  availableEvidence: string[];
  completionScore: number;
  missingRequirementKeys: string[];
  missingRequirements: string[];
  primaryMissingRequirementKeys: string[];
  primaryMissingRequirements: string[];
  secondaryMissingRequirementKeys: string[];
  secondaryMissingRequirements: string[];
  nextActions: string[];
  primaryNextActions: string[];
  secondaryNextActions: string[];
  guidance?: string;
}
