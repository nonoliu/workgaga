import type { AIMCPServerConfig } from './mcpTypes';

const MCP_SERVER_STORAGE_KEY = 'workgaga.ai.mcp.servers.v1';

export const listAIMCPServers = (): AIMCPServerConfig[] => {
  try {
    const raw = localStorage.getItem(MCP_SERVER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as AIMCPServerConfig[] : [];
  } catch {
    return [];
  }
};

export const saveAIMCPServers = (servers: AIMCPServerConfig[]): void => {
  localStorage.setItem(MCP_SERVER_STORAGE_KEY, JSON.stringify(servers));
};

export const upsertAIMCPServer = (server: Omit<AIMCPServerConfig, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number }): AIMCPServerConfig => {
  const now = Date.now();
  const servers = listAIMCPServers();
  const existing = servers.find((item) => item.id === server.id);
  const next: AIMCPServerConfig = {
    ...server,
    createdAt: existing?.createdAt ?? server.createdAt ?? now,
    updatedAt: now,
  };
  saveAIMCPServers([next, ...servers.filter((item) => item.id !== server.id)]);
  return next;
};

export const removeAIMCPServer = (id: string): void => {
  saveAIMCPServers(listAIMCPServers().filter((server) => server.id !== id));
};
