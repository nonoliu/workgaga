import type { AIModelProvider } from '../llmTypes';
import type { RuntimeAgentLike, RuntimeSkillLike } from '../agentRuntime';
import type { AIProviderToolStrategy } from '../providerToolStrategy';
import type { AICodeChangePlanGate, AICodeEvidenceRunResult, AIFinalAnswerVerification, AIIntentDetectionResult, AIProblemPolicy } from '../solver';

export interface AgentSystemPromptV2Input {
  userInput: string;
  provider: AIModelProvider;
  model: string;
  agent?: RuntimeAgentLike & { name?: string; runMode?: string; memoryScope?: string };
  skills?: Array<RuntimeSkillLike & { name?: string }>;
  availableToolNames: string[];
  permissionMode?: string;
  conversationSummary?: string;
  currentDocumentPath?: string;
  currentKnowledgeBasePath?: string;
  conversationId?: string;
  intentDetection?: AIIntentDetectionResult;
  problemPolicy?: AIProblemPolicy;
  preflightContext?: string;
  finalAnswerVerification?: AIFinalAnswerVerification;
  codeEvidence?: AICodeEvidenceRunResult;
  codeChangePlanGate?: AICodeChangePlanGate;
  providerToolStrategy?: AIProviderToolStrategy;
  locale?: 'zh-CN' | 'en-US';
}

export interface PromptSectionInput extends AgentSystemPromptV2Input {
  enabledTools: Set<string>;
}
