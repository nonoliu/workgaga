import type { AIToolDefinition } from './tools';
import type { AIMCPClientAdapter, AIMCPServerConfig, AIMCPToolDescriptor } from './mcpTypes';

const mcpToolName = (serverId: string, toolName: string): string => `mcp__${serverId.replace(/[^a-zA-Z0-9_-]/g, '_')}__${toolName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

export const createUnavailableMCPClientAdapter = (): AIMCPClientAdapter => ({
  async callTool(server, toolName) {
    throw new Error(`MCP server 尚未连接：${server.name} / ${toolName}`);
  },
});

export const createMCPToolDefinition = (
  server: AIMCPServerConfig,
  descriptor: AIMCPToolDescriptor,
  adapter: AIMCPClientAdapter = createUnavailableMCPClientAdapter(),
): AIToolDefinition<Record<string, unknown>> => ({
  name: mcpToolName(descriptor.serverId, descriptor.name),
  title: descriptor.title || `${descriptor.serverName}: ${descriptor.name}`,
  description: descriptor.description || `Call MCP tool ${descriptor.name} from ${descriptor.serverName}.`,
  inputSchema: descriptor.inputSchema,
  readOnly: descriptor.readOnly ?? false,
  concurrencySafe: descriptor.readOnly ?? false,
  defaultPermission: descriptor.defaultPermission ?? server.defaultPermission ?? 'ask',
  validate(input) {
    if (!input || typeof input !== 'object') return { ok: false, message: 'MCP 工具参数必须是对象。' };
    return { ok: true, input: input as Record<string, unknown> };
  },
  checkPermission() {
    return { behavior: 'allow', reason: '已通过统一权限引擎。' };
  },
  async call(input, _context, onProgress) {
    onProgress({ message: `正在调用 MCP 工具：${descriptor.serverName}/${descriptor.name}` });
    return adapter.callTool(server, descriptor.name, input);
  },
});

export const createMCPToolDefinitions = (
  servers: AIMCPServerConfig[],
  descriptors: AIMCPToolDescriptor[],
  adapter?: AIMCPClientAdapter,
): AIToolDefinition<Record<string, unknown>>[] => descriptors
  .map((descriptor): AIToolDefinition<Record<string, unknown>> | null => {
    const server = servers.find((item) => item.id === descriptor.serverId && item.enabled);
    return server ? createMCPToolDefinition(server, descriptor, adapter) : null;
  })
  .filter((item): item is AIToolDefinition<Record<string, unknown>> => Boolean(item));
