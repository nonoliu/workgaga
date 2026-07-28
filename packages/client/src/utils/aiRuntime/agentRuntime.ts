export interface RuntimeSkillLike {
  id: string;
  preferredTools?: string[];
  requiredTools?: string[];
}

export interface RuntimeAgentLike {
  id: string;
  allowedTools?: string[];
  permissionMode?: 'ask' | 'auto-read' | 'auto-write' | 'bypass';
}

export interface ResolveRuntimeToolsInput {
  agent?: RuntimeAgentLike;
  skills?: RuntimeSkillLike[];
  builtinToolNames: string[];
}

export interface ResolveRuntimeToolsResult {
  allowedToolNames: string[];
  requiredToolNames: string[];
  preferredToolNames: string[];
}

const unique = (items: string[]): string[] => Array.from(new Set(items.filter(Boolean)));

export const resolveRuntimeTools = ({ agent, skills = [], builtinToolNames }: ResolveRuntimeToolsInput): ResolveRuntimeToolsResult => {
  const builtin = new Set(builtinToolNames);
  const agentAllowed = new Set((agent?.allowedTools?.length ? agent.allowedTools : builtinToolNames).filter((name) => builtin.has(name)));
  const preferredToolNames = unique(skills.flatMap((skill) => skill.preferredTools ?? []).filter((name) => builtin.has(name)));
  const requiredToolNames = unique(skills.flatMap((skill) => skill.requiredTools ?? []).filter((name) => builtin.has(name)));

  const skillRequested = unique([...preferredToolNames, ...requiredToolNames]);
  const allowedToolNames = skillRequested.length
    ? skillRequested.filter((name) => agentAllowed.has(name))
    : Array.from(agentAllowed);

  return {
    allowedToolNames,
    requiredToolNames: requiredToolNames.filter((name) => agentAllowed.has(name)),
    preferredToolNames: preferredToolNames.filter((name) => agentAllowed.has(name)),
  };
};
