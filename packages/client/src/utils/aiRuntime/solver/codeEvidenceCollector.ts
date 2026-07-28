import type { AIRuntimeEvent } from '../types';
import { executeAITool } from '../tools';
import type { AIToolContext, AIToolRegistry } from '../tools';
import type { AIIntentDetectionResult, AICodeEvidenceRunResult, AIPreflightToolResult } from './types';

const codeIntents = new Set(['code_understanding', 'code_modification', 'troubleshooting']);

const extractDirectory = (input: string, currentFileName?: string): string | undefined => {
  const absolutePath = input.match(/(?:^|\s)(\/[^\s:'"`]+)(?:\s|$)/)?.[1];
  if (absolutePath) return absolutePath.includes('.') ? absolutePath.split('/').slice(0, -1).join('/') : absolutePath;
  if (currentFileName?.startsWith('/')) return currentFileName.includes('.') ? currentFileName.split('/').slice(0, -1).join('/') : currentFileName;
  return undefined;
};

const extractQuery = (input: string): string => {
  const symbol = input.match(/[`'"“”]([A-Za-z_$][\w$.-]{2,})[`'"“”]/)?.[1]
    || input.match(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\b/)?.[1];
  if (symbol && !['bug', 'debug', 'fix', 'code', 'error'].includes(symbol.toLowerCase())) return symbol;
  return input.slice(0, 80);
};

const summarizeOutput = (output: unknown): string => {
  try {
    const text = JSON.stringify(output, null, 2);
    return text.length > 5000 ? `${text.slice(0, 5000)}\n[code evidence truncated]` : text;
  } catch {
    return String(output);
  }
};

const createId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const extractMatchedFilePaths = (output: unknown): string[] => {
  if (!output || typeof output !== 'object') return [];
  const matches = (output as Record<string, unknown>).matches;
  if (!Array.isArray(matches)) return [];
  const paths = matches
    .map((match) => (match && typeof match === 'object' ? (match as Record<string, unknown>).path : undefined))
    .filter((path): path is string => typeof path === 'string' && path.startsWith('/'));
  return Array.from(new Set(paths)).slice(0, 3);
};

export const collectCodeEvidence = async (params: {
  userInput: string;
  detection: AIIntentDetectionResult;
  registry: AIToolRegistry;
  allowedToolNames: string[];
  context?: AIToolContext;
  currentFileName?: string;
  emit?: (event: AIRuntimeEvent) => void;
}): Promise<AICodeEvidenceRunResult> => {
  if (!codeIntents.has(params.detection.intent)) {
    return { attempted: false, ok: false, evidenceContext: '', results: [] };
  }

  const allowed = new Set(params.allowedToolNames);
  const directory = extractDirectory(params.userInput, params.currentFileName);
  const query = extractQuery(params.userInput);
  const results: AIPreflightToolResult[] = [];

  if (!directory) {
    return {
      attempted: true,
      ok: false,
      query,
      evidenceContext: '# Code evidence\n代码任务已识别，但没有可用的项目目录或当前文件路径。请用户提供文件路径、项目目录，或在 IDE 中打开相关文件。',
      results,
    };
  }

  const runTool = async (toolName: string, input: Record<string, unknown>): Promise<AIPreflightToolResult | undefined> => {
    if (!allowed.has(toolName) || params.context?.signal?.aborted) return undefined;
    const result = await executeAITool({
      registry: params.registry,
      call: {
        id: createId('code-evidence'),
        name: toolName,
        input,
      },
      context: params.context,
      emit: params.emit,
    });
    const evidenceResult = {
      toolName,
      ok: !result.error,
      output: result.output,
      error: result.error,
    };
    results.push(evidenceResult);
    return evidenceResult;
  };

  await runTool('list-files', { directory, recursive: true, maxDepth: 2 });
  const searchResult = await runTool('search-files', { directory, query, maxDepth: 3 });

  if (searchResult?.ok && allowed.has('read-file')) {
    const matchedPaths = extractMatchedFilePaths(searchResult.output);
    for (const path of matchedPaths) {
      if (params.context?.signal?.aborted) break;
      await runTool('read-file', { path, maxChars: 8000 });
    }
  }

  const ok = results.some((result) => result.ok);
  const evidenceContext = [
    '# Code evidence',
    `directory: ${directory}`,
    `query: ${query}`,
    ...results.map((result) => `## ${result.toolName}\nstatus: ${result.ok ? 'ok' : 'error'}\n${result.ok ? summarizeOutput(result.output) : result.error}`),
  ].join('\n\n');

  return {
    attempted: true,
    ok,
    directory,
    query,
    evidenceContext,
    results,
  };
};
