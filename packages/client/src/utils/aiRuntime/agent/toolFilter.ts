import type { AIToolDefinition } from '../tools';
import type { AIAgentDefinition } from './types';

const WRITE_TOOL_NAMES = new Set(['write-file', 'apply-patch', 'delete-file']);
const AGENT_RECURSIVE_TOOL_NAMES = new Set(['run-agent']);
const VERIFY_ONLY_TOOL_NAMES = new Set(['run-check']);

const matchesToolName = (toolName: string, pattern: string): boolean => pattern === '*' || pattern === toolName;

export const filterToolsForAIAgent = (agent: AIAgentDefinition, tools: AIToolDefinition[]): AIToolDefinition[] => {
  const allowedPatterns = agent.tools?.length ? agent.tools : ['*'];
  const deniedPatterns = new Set(agent.disallowedTools ?? []);

  return tools.filter((tool) => {
    if (AGENT_RECURSIVE_TOOL_NAMES.has(tool.name)) return false;
    if (agent.mode === 'read-only' && (!tool.readOnly || WRITE_TOOL_NAMES.has(tool.name) || VERIFY_ONLY_TOOL_NAMES.has(tool.name))) return false;
    if (agent.mode === 'plan' && (!tool.readOnly || WRITE_TOOL_NAMES.has(tool.name) || VERIFY_ONLY_TOOL_NAMES.has(tool.name))) return false;
    if (agent.mode === 'verify' && (WRITE_TOOL_NAMES.has(tool.name) || (!tool.readOnly && !VERIFY_ONLY_TOOL_NAMES.has(tool.name)))) return false;
    if (agent.mode !== 'verify' && VERIFY_ONLY_TOOL_NAMES.has(tool.name)) return false;
    if (deniedPatterns.has(tool.name) || deniedPatterns.has('*')) return false;
    return allowedPatterns.some((pattern) => matchesToolName(tool.name, pattern));
  });
};
