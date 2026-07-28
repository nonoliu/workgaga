import type { AIToolJSONSchema, AIToolPermissionBehavior } from './tools';

export interface AIToolPluginManifest {
  id: string;
  kind: 'tool';
  name: string;
  version: string;
  sourceType: 'local' | 'github' | 'skillhub';
  description?: string;
  toolName: string;
  title?: string;
  inputSchema: AIToolJSONSchema;
  runtime: 'mcp' | 'http' | 'builtin';
  mcpServerId?: string;
  httpEndpoint?: string;
  readOnly?: boolean;
  defaultPermission?: AIToolPermissionBehavior;
}

export const validateToolPluginManifest = (manifest: Record<string, unknown>): string[] => {
  const errors: string[] = [];
  if (manifest.kind !== 'tool') errors.push('kind 必须为 tool。');
  if (typeof manifest.id !== 'string' || !manifest.id.trim()) errors.push('缺少插件 id。');
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) errors.push('缺少插件名称。');
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) errors.push('缺少插件版本。');
  if (typeof manifest.toolName !== 'string' || !manifest.toolName.trim()) errors.push('缺少 toolName。');
  if (manifest.runtime !== 'mcp' && manifest.runtime !== 'http' && manifest.runtime !== 'builtin') errors.push('不支持的 tool runtime。');
  if (!manifest.inputSchema || typeof manifest.inputSchema !== 'object') errors.push('缺少 inputSchema。');
  return errors;
};
