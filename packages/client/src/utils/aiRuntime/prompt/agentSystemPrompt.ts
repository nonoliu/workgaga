import { buildEnvironmentSection } from './environmentInfo';
import {
  buildActionsSection,
  buildDoingTasksSection,
  buildIntroSection,
  buildOutputEfficiencySection,
  buildSystemSection,
  buildToneSection,
  buildToolResultSection,
  buildVerificationSection,
  buildWorkspaceSection,
} from './sections';
import { buildToolGuidanceSection } from './toolGuidance';
import type { AgentSystemPromptV2Input, PromptSectionInput } from './promptTypes';

const buildDynamicRuntimeSection = (input: PromptSectionInput): string | null => {
  const items = [
    input.intentDetection ? `Detected intent: ${input.intentDetection.intent} (${input.intentDetection.confidence}) — ${input.intentDetection.reasons.join('; ')}` : null,
    input.problemPolicy ? `Problem policy: requiredTools=[${input.problemPolicy.requiredTools.join(', ')}], preferredTools=[${input.problemPolicy.preferredTools.join(', ')}], fallbackTools=[${input.problemPolicy.fallbackTools.join(', ')}], directAnswerAllowed=${input.problemPolicy.directAnswerAllowed}, verificationRequired=${input.problemPolicy.verificationRequired}` : null,
    input.problemPolicy?.instructions.length ? `Policy instructions:\n${input.problemPolicy.instructions.map((item: string) => `- ${item}`).join('\n')}` : null,
    input.providerToolStrategy ? `Provider tool strategy: ${input.providerToolStrategy.toolMode}. Native tools: ${input.providerToolStrategy.supportsNativeToolCalling}. Preflight evidence may already be available even when native tools are not supported.\n${input.providerToolStrategy.notes.map((item: string) => `- ${item}`).join('\n')}` : null,
    input.preflightContext || null,
    input.codeEvidence?.evidenceContext || null,
    input.codeChangePlanGate?.context || null,
    input.finalAnswerVerification ? `Final answer gate: ok=${input.finalAnswerVerification.ok}, blocking=${input.finalAnswerVerification.blocking}, confidence=${input.finalAnswerVerification.confidence}\nRequired evidence: ${input.finalAnswerVerification.requiredEvidence.join('; ') || '-'}\nAvailable evidence: ${input.finalAnswerVerification.availableEvidence.join('; ') || '-'}\nReasons:\n${input.finalAnswerVerification.reasons.map((item: string) => `- ${item}`).join('\n')}\nGuidance: ${input.finalAnswerVerification.guidance || '-'}` : null,
    input.conversationSummary ? `Conversation summary:\n${input.conversationSummary}` : null,
    input.userInput ? `Current user request:\n${input.userInput}` : null,
  ].filter((item): item is string => Boolean(item));

  if (!items.length) return null;
  return ['# Dynamic runtime context', ...items.map((item) => `- ${item}`)].join('\n');
};

export const buildAgentSystemPromptV2 = (input: AgentSystemPromptV2Input): string[] => {
  const enabledTools = new Set(input.availableToolNames);
  const sectionInput: PromptSectionInput = { ...input, enabledTools };

  return [
    buildIntroSection(),
    buildSystemSection(),
    buildDoingTasksSection(),
    buildActionsSection(),
    buildToolGuidanceSection(enabledTools),
    buildWorkspaceSection(),
    buildToolResultSection(),
    buildVerificationSection(),
    buildToneSection(),
    buildOutputEfficiencySection(),
    buildEnvironmentSection(sectionInput),
    buildDynamicRuntimeSection(sectionInput),
  ].filter((section): section is string => Boolean(section));
};
