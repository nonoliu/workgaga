import { invoke } from '@tauri-apps/api/core';
import { mkdir, readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { assertSafeFileReadPath, assertSafeFileWritePath } from './security';
import type { AIToolContext, AIToolDefinition } from './tools';
import { isAbsoluteWorkspacePath, resolveWorkspacePath } from './workspace';

const MAX_LIST_ENTRIES = 200;
const MAX_READ_CHARS = 80_000;
const MAX_SEARCH_FILES = 120;
const MAX_SEARCH_MATCHES = 80;

const joinPath = (base: string, name: string): string => `${base.replace(/[\/]+$/, '')}/${name}`;
const textInput = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const resolveToolPath = (context: AIToolContext, path: string): string => resolveWorkspacePath(context.workspace, path);

const validateObject = <TInput>(input: unknown, build: (record: Record<string, unknown>) => TInput | string): { ok: boolean; input?: TInput; message?: string } => {
  if (!input || typeof input !== 'object') return { ok: false, message: '工具参数必须是对象。' };
  const result = build(input as Record<string, unknown>);
  if (typeof result === 'string') return { ok: false, message: result };
  return { ok: true, input: result };
};

const isProbablyTextFile = (path: string): boolean => /\.(md|markdown|txt|json|ts|tsx|js|jsx|vue|css|scss|html|rs|toml|yaml|yml|xml|py|go|java|kt|swift|c|cpp|h|hpp)$/i.test(path);

export interface ListFilesInput {
  directory: string;
  recursive?: boolean;
  maxDepth?: number;
}

const listFiles = async (directory: string, recursive: boolean, maxDepth: number, depth = 0): Promise<Array<{ path: string; name: string; type: 'file' | 'directory' }>> => {
  if (depth > maxDepth) return [];
  const entries = await readDir(directory);
  const results: Array<{ path: string; name: string; type: 'file' | 'directory' }> = [];
  for (const entry of entries.slice(0, MAX_LIST_ENTRIES)) {
    const path = joinPath(directory, entry.name || '');
    if (entry.isDirectory) {
      results.push({ path, name: entry.name || '', type: 'directory' });
      if (recursive) results.push(...await listFiles(path, recursive, maxDepth, depth + 1));
    } else {
      results.push({ path, name: entry.name || '', type: 'file' });
    }
  }
  return results.slice(0, MAX_LIST_ENTRIES);
};

export const listFilesTool: AIToolDefinition<ListFilesInput> = {
  name: 'list-files',
  title: '列出文件',
  description: 'List files under a directory. Use this to inspect a project or folder structure before reading files.',
  inputSchema: {
    type: 'object',
    properties: {
      directory: { type: 'string', description: 'Directory path.' },
      recursive: { type: 'boolean', description: 'Whether to recurse into subdirectories.' },
      maxDepth: { type: 'number', description: 'Maximum recursive depth.' },
    },
    required: ['directory'],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<ListFilesInput>(input, (record) => {
      const directory = textInput(record.directory);
      if (!directory) return '缺少 directory。';
      return {
        directory,
        recursive: Boolean(record.recursive),
        maxDepth: typeof record.maxDepth === 'number' ? Math.max(0, Math.min(5, Math.floor(record.maxDepth))) : 1,
      };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '已通过统一权限引擎。' };
  },
  async call(input, context) {
    const directory = resolveToolPath(context, input.directory);
    return { directory, entries: await listFiles(directory, Boolean(input.recursive), input.maxDepth ?? 1) };
  },
};

export interface ReadFileInput {
  path: string;
  maxChars?: number;
}

export const readFileTool: AIToolDefinition<ReadFileInput> = {
  name: 'read-file',
  title: '读取文件',
  description: 'Read a text file by absolute path.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path.' },
      maxChars: { type: 'number', description: 'Maximum returned characters.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<ReadFileInput>(input, (record) => {
      const path = textInput(record.path);
      if (!path) return '缺少 path。';
      return { path, maxChars: typeof record.maxChars === 'number' ? Math.max(1000, Math.min(MAX_READ_CHARS, Math.floor(record.maxChars))) : MAX_READ_CHARS };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '已通过统一权限引擎。' };
  },
  async call(input, context) {
    const path = resolveToolPath(context, input.path);
    assertSafeFileReadPath(path);
    const content = await readTextFile(path);
    return {
      path,
      content: content.length > (input.maxChars ?? MAX_READ_CHARS) ? `${content.slice(0, input.maxChars)}\n\n[内容已截断]` : content,
    };
  },
};

export interface SearchFilesInput {
  directory: string;
  query: string;
  maxDepth?: number;
}

export const searchFilesTool: AIToolDefinition<SearchFilesInput> = {
  name: 'search-files',
  title: '搜索文件内容',
  description: 'Search text files under a directory for exact text query.',
  inputSchema: {
    type: 'object',
    properties: {
      directory: { type: 'string', description: 'Directory path.' },
      query: { type: 'string', description: 'Exact text to search for.' },
      maxDepth: { type: 'number', description: 'Maximum recursive depth.' },
    },
    required: ['directory', 'query'],
    additionalProperties: false,
  },
  readOnly: true,
  concurrencySafe: true,
  defaultPermission: 'allow',
  validate(input) {
    return validateObject<SearchFilesInput>(input, (record) => {
      const directory = textInput(record.directory);
      const query = textInput(record.query);
      if (!directory) return '缺少 directory。';
      if (!query) return '缺少 query。';
      return { directory, query, maxDepth: typeof record.maxDepth === 'number' ? Math.max(0, Math.min(5, Math.floor(record.maxDepth))) : 3 };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '已通过统一权限引擎。' };
  },
  async call(input, context) {
    const directory = resolveToolPath(context, input.directory);
    const entries = await listFiles(directory, true, input.maxDepth ?? 3);
    const files = entries.filter((entry) => entry.type === 'file' && isProbablyTextFile(entry.path)).slice(0, MAX_SEARCH_FILES);
    const matches: Array<{ path: string; line: number; preview: string }> = [];
    for (const file of files) {
      if (matches.length >= MAX_SEARCH_MATCHES) break;
      try {
        assertSafeFileReadPath(file.path);
        const content = await readTextFile(file.path);
        content.split('\n').forEach((line, index) => {
          if (matches.length < MAX_SEARCH_MATCHES && line.includes(input.query)) {
            matches.push({ path: file.path, line: index + 1, preview: line.trim().slice(0, 240) });
          }
        });
      } catch {
        // 忽略不可读文件
      }
    }
    return { directory, query: input.query, matches };
  },
};

export interface WriteFileInput {
  path: string;
  content: string;
}

export const writeFileTool: AIToolDefinition<WriteFileInput> = {
  name: 'write-file',
  title: '写入文件',
  description: 'Overwrite a text file. Use only after user approval.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path.' },
      content: { type: 'string', description: 'New file content.' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  readOnly: false,
  concurrencySafe: false,
  defaultPermission: 'ask',
  validate(input) {
    return validateObject<WriteFileInput>(input, (record) => {
      const path = textInput(record.path);
      if (!path) return '缺少 path。';
      if (isAbsoluteWorkspacePath(path)) {
        try {
          assertSafeFileWritePath(path);
        } catch (error) {
          return error instanceof Error ? error.message : '文件路径不安全。';
        }
      }
      if (typeof record.content !== 'string') return '缺少 content。';
      return { path, content: record.content };
    });
  },
  checkPermission() {
    return { behavior: 'allow', reason: '已通过统一权限引擎。' };
  },
  async call(input, context) {
    const path = resolveToolPath(context, input.path);
    assertSafeFileWritePath(path);
    const dir = path.split(/[\\/]/).slice(0, -1).join('/');
    if (dir) await mkdir(dir, { recursive: true });
    await writeTextFile(path, input.content);
    return { written: true, path, bytes: input.content.length };
  },
};

export const applyPatchTool: AIToolDefinition<Record<string, unknown>> = {
  name: 'apply-patch',
  title: '应用补丁',
  description: 'Apply a code patch. Placeholder until diff preview and patch applier are implemented.',
  inputSchema: { type: 'object', properties: { patch: { type: 'string' } }, required: ['patch'], additionalProperties: false },
  readOnly: false,
  concurrencySafe: false,
  defaultPermission: 'ask',
  validate(input) {
    return validateObject<Record<string, unknown>>(input, (record) => (typeof record.patch === 'string' && record.patch.trim() ? record : '缺少 patch。'));
  },
  checkPermission() {
    return { behavior: 'allow', reason: '已通过统一权限引擎。' };
  },
  async call() {
    throw new Error('apply-patch 工具已注册，但补丁预览和应用器将在后续阶段启用。');
  },
};

interface RunCheckOutput {
  code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}

const isAllowedCheckCommand = (command: string): boolean => {
  const trimmed = command.trim();
  return [
    'npm test',
    'npm run test',
    'npm run build',
    'npm run lint',
    'yarn test',
    'yarn build',
    'yarn lint',
    'pnpm test',
    'pnpm build',
    'pnpm lint',
  ].some((prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `));
};

export const runCheckTool: AIToolDefinition<Record<string, unknown>, RunCheckOutput> = {
  name: 'run-check',
  title: '运行检查',
  description: 'Run whitelisted project checks such as build/test/lint.',
  inputSchema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' }, timeoutMs: { type: 'number' } }, required: ['command'], additionalProperties: false },
  readOnly: false,
  concurrencySafe: false,
  defaultPermission: 'ask',
  validate(input) {
    return validateObject<Record<string, unknown>>(input, (record) => {
      const command = textInput(record.command);
      if (!command) return '缺少 command。';
      if (!isAllowedCheckCommand(command)) return `命令不在 run-check 白名单内: ${command}`;
      if (record.cwd !== undefined && typeof record.cwd !== 'string') return 'cwd 必须是字符串。';
      if (record.timeoutMs !== undefined && typeof record.timeoutMs !== 'number') return 'timeoutMs 必须是数字。';
      const cwd = typeof record.cwd === 'string' ? record.cwd.trim() : undefined;
      return { command, cwd: cwd || undefined, timeoutMs: typeof record.timeoutMs === 'number' ? record.timeoutMs : undefined };
    });
  },
  checkPermission() {
    return { behavior: 'ask', reason: '运行项目检查命令需要确认。' };
  },
  async call(input, context) {
    const cwd = typeof input.cwd === 'string' ? resolveToolPath(context, input.cwd) : context.workspace?.workingDirectory;
    const result = await invoke<RunCheckOutput>('ai_run_check', {
      command: String(input.command),
      cwd,
      timeoutMs: typeof input.timeoutMs === 'number' ? input.timeoutMs : 120000,
    });
    return result;
  },
};

export const developerAITools: AIToolDefinition[] = [
  listFilesTool,
  readFileTool,
  searchFilesTool,
  writeFileTool,
  applyPatchTool,
  runCheckTool,
];
