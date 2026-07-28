import { getBuiltInAIAgents } from './builtInAgents';
import { loadProjectAIAgents, type AILoadAgentsResult } from './loadAgents';
import type { AIAgentDefinition } from './types';

const sourcePriority: Record<NonNullable<AIAgentDefinition['source']>, number> = {
  'built-in': 0,
  plugin: 1,
  user: 2,
  project: 3,
};

const getPriority = (agent: AIAgentDefinition): number => agent.priority ?? sourcePriority[agent.source ?? 'built-in'] ?? 0;

export class AIAgentRegistry {
  private readonly agents = new Map<string, AIAgentDefinition>();

  constructor(agents: AIAgentDefinition[] = []) {
    this.registerMany(agents);
  }

  register(agent: AIAgentDefinition): void {
    const existing = this.agents.get(agent.type);
    if (!existing || getPriority(agent) >= getPriority(existing)) {
      this.agents.set(agent.type, agent);
    }
  }

  registerMany(agents: AIAgentDefinition[]): void {
    agents.forEach((agent) => this.register(agent));
  }

  get(type: string): AIAgentDefinition | undefined {
    return this.agents.get(type);
  }

  list(): AIAgentDefinition[] {
    return Array.from(this.agents.values());
  }

  clear(): void {
    this.agents.clear();
  }
}

export const createAIAgentRegistry = (agents: AIAgentDefinition[] = []): AIAgentRegistry => new AIAgentRegistry(agents);

export const createDefaultAIAgentRegistry = (agents: AIAgentDefinition[] = []): AIAgentRegistry => createAIAgentRegistry([
  ...getBuiltInAIAgents(),
  ...agents,
]);

export interface ProjectAIAgentRegistryResult extends AILoadAgentsResult {
  registry: AIAgentRegistry;
}

export const createProjectAIAgentRegistry = async (projectRoot: string, agents: AIAgentDefinition[] = []): Promise<ProjectAIAgentRegistryResult> => {
  const loaded = await loadProjectAIAgents(projectRoot);
  return {
    ...loaded,
    registry: createDefaultAIAgentRegistry([
      ...agents,
      ...loaded.agents,
    ]),
  };
};
