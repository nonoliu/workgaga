import type { PromptSectionInput } from './promptTypes';

export const buildEnvironmentSection = (input: PromptSectionInput): string => {
  const items = [
    `Current date/time: ${new Date().toLocaleString()}`,
    `Provider: ${input.provider}`,
    `Provider tool mode: ${input.providerToolStrategy?.toolMode || 'unknown'}`,
    `Model: ${input.model}`,
    `Conversation ID: ${input.conversationId || 'unknown'}`,
    `Permission mode: ${input.permissionMode || input.agent?.permissionMode || 'ask'}`,
    input.agent?.name ? `Current agent: ${input.agent.name}` : null,
    input.skills?.length ? `Active skills: ${input.skills.map((skill) => skill.name || skill.id).join(', ')}` : null,
    input.currentKnowledgeBasePath ? `Knowledge base path: ${input.currentKnowledgeBasePath}` : null,
    input.currentDocumentPath ? `Current document path: ${input.currentDocumentPath}` : null,
    input.availableToolNames.length ? `Available tools: ${input.availableToolNames.join(', ')}` : 'Available tools: none',
  ].filter((item): item is string => Boolean(item));

  return ['# Environment', ...items.map((item) => `- ${item}`)].join('\n');
};
