import type { AIToolDefinition } from './types';

export class AIToolRegistry {
  private readonly tools = new Map<string, AIToolDefinition>();

  register(tool: AIToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: AIToolDefinition[]): void {
    tools.forEach((tool) => this.register(tool));
  }

  get(name: string): AIToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): AIToolDefinition[] {
    return Array.from(this.tools.values());
  }

  filter(names: string[]): AIToolDefinition[] {
    const allowed = new Set(names);
    return this.list().filter((tool) => allowed.has(tool.name));
  }
}

export const createAIToolRegistry = (tools: AIToolDefinition[] = []): AIToolRegistry => {
  const registry = new AIToolRegistry();
  registry.registerMany(tools);
  return registry;
};
