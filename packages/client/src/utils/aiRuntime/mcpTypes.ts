import type { AIToolJSONSchema, AIToolPermissionBehavior } from './tools';

export type AIMCPTransport = 'stdio' | 'sse' | 'http' | 'websocket';

export interface AIMCPServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: AIMCPTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  defaultPermission?: AIToolPermissionBehavior;
  createdAt: number;
  updatedAt: number;
}

export interface AIMCPToolDescriptor {
  serverId: string;
  serverName: string;
  name: string;
  title?: string;
  description?: string;
  inputSchema: AIToolJSONSchema;
  readOnly?: boolean;
  defaultPermission?: AIToolPermissionBehavior;
}

export interface AIMCPCallInput {
  toolName: string;
  arguments: unknown;
}

export interface AIMCPClientAdapter {
  callTool(server: AIMCPServerConfig, toolName: string, input: unknown): Promise<unknown>;
}
