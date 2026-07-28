import type { AIAgentDefinition } from './types';

const formatTools = (agent: AIAgentDefinition): string => {
  if (!agent.tools?.length) return 'default';
  return agent.tools.includes('*') ? 'all' : agent.tools.join(', ');
};

export const formatAIAgentListPrompt = (agents: AIAgentDefinition[]): string => {
  if (!agents.length) return '';

  const lines = agents.map((agent) => [
    `- ${agent.type}${agent.displayName ? ` (${agent.displayName})` : ''}`,
    `  - Source: ${agent.source ?? 'built-in'}`,
    `  - Mode: ${agent.mode ?? 'execute'}`,
    `  - Description: ${agent.description}`,
    agent.whenToUse ? `  - Use when: ${agent.whenToUse}` : undefined,
    `  - Tools: ${formatTools(agent)}`,
  ].filter(Boolean).join('\n'));

  return [
    'Available AI agents:',
    ...lines,
    '',
    'Agent selection guidance:',
    '- Use explore for read-only codebase research, source tracing, and mechanism analysis.',
    '- Use plan for implementation planning, architecture proposals, and confirm-before-execute tasks.',
    '- Use general-purpose for complex implementation, bug fixing, refactoring, and troubleshooting.',
    '- Use verifier after non-trivial code changes or when the user asks to validate/test results.',
    '- Use runtime-guide for questions about AI Runtime, agents, tools, permissions, and configuration.',
    '- Prefer explicit user-selected agents when provided; otherwise choose the most specific suitable agent.',
  ].join('\n');
};
