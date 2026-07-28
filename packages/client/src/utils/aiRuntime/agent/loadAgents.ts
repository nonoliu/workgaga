import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import type { AIAgentDefinition, AIAgentMode } from './types';

export interface AILoadAgentsResult {
  agents: AIAgentDefinition[];
  failedFiles: Array<{ path: string; error: string }>;
}

interface ParsedFrontmatter {
  data: Record<string, unknown>;
  body: string;
}

const AGENTS_DIR = '.workgaga/agents';

const joinPath = (...parts: string[]): string => {
  const absolute = parts[0]?.startsWith('/');
  const joined = parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return absolute ? `/${joined}` : joined;
};

const isMarkdownFile = (name: string): boolean => /\.md$/i.test(name);

const parseScalar = (value: string): unknown => {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^['"]|['"]$/g, '');
};

const parseInlineList = (value: string): string[] | undefined => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return undefined;
  return trimmed
    .slice(1, -1)
    .split(',')
    .map((item) => String(parseScalar(item)).trim())
    .filter(Boolean);
};

const parseFrontmatterBlock = (block: string): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  const lines = block.split(/\r?\n/);
  let currentListKey: string | undefined;

  lines.forEach((line) => {
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentListKey) {
      const list = Array.isArray(data[currentListKey]) ? data[currentListKey] as string[] : [];
      list.push(String(parseScalar(listItem[1])));
      data[currentListKey] = list;
      return;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) return;
    const [, key, rawValue] = match;
    if (!rawValue.trim()) {
      currentListKey = key;
      data[key] = [];
      return;
    }
    currentListKey = undefined;
    data[key] = parseInlineList(rawValue) ?? parseScalar(rawValue);
  });

  return data;
};

const parseFrontmatter = (content: string): ParsedFrontmatter => {
  if (!content.startsWith('---')) return { data: {}, body: content.trim() };
  const end = content.indexOf('\n---', 3);
  if (end < 0) return { data: {}, body: content.trim() };
  const block = content.slice(3, end).trim();
  const body = content.slice(end + 4).trim();
  return { data: parseFrontmatterBlock(block), body };
};

const asString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => String(item).trim()).filter(Boolean);
};

const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

const asMode = (value: unknown): AIAgentMode | undefined => {
  const mode = asString(value);
  return mode === 'read-only' || mode === 'plan' || mode === 'execute' || mode === 'verify' ? mode : undefined;
};

const normalizeAgent = (filePath: string, content: string): AIAgentDefinition => {
  const { data, body } = parseFrontmatter(content);
  const type = asString(data.name) ?? asString(data.type) ?? filePath.split('/').pop()?.replace(/\.md$/i, '') ?? '';
  const description = asString(data.description);
  if (!type) throw new Error('缺少 name 或 type。');
  if (!description) throw new Error('缺少 description。');
  if (!body) throw new Error('缺少 agent system prompt 内容。');

  return {
    type,
    displayName: asString(data.displayName) ?? asString(data.title),
    description,
    whenToUse: asString(data.whenToUse),
    systemPrompt: body,
    tools: asStringArray(data.tools),
    disallowedTools: asStringArray(data.disallowedTools),
    model: asString(data.model) ?? 'inherit',
    mode: asMode(data.mode) ?? 'execute',
    background: asBoolean(data.background),
    maxTurns: asNumber(data.maxTurns),
    timeoutMs: asNumber(data.timeoutMs),
    source: 'project',
  };
};

export const loadProjectAIAgents = async (projectRoot: string): Promise<AILoadAgentsResult> => {
  const agents: AIAgentDefinition[] = [];
  const failedFiles: Array<{ path: string; error: string }> = [];
  const agentsDir = joinPath(projectRoot, AGENTS_DIR);

  let entries: Array<{ name?: string; isFile?: boolean; isDirectory?: boolean }> = [];
  try {
    entries = await readDir(agentsDir) as Array<{ name?: string; isFile?: boolean; isDirectory?: boolean }>;
  } catch {
    return { agents, failedFiles };
  }

  await Promise.all(entries.map(async (entry) => {
    if (!entry.name || entry.isDirectory || !isMarkdownFile(entry.name)) return;
    const filePath = joinPath(agentsDir, entry.name);
    try {
      const content = await readTextFile(filePath);
      agents.push(normalizeAgent(filePath, content));
    } catch (error) {
      failedFiles.push({
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }));

  return { agents, failedFiles };
};
