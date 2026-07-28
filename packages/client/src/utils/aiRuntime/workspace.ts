import { documentDir } from '@tauri-apps/api/path';
import { mkdir } from '@tauri-apps/plugin-fs';

export interface AIRuntimeWorkspaceContext {
  workingDirectory: string;
  outputDirectory: string;
  taskOutputDirectory: string;
  isFallback: boolean;
  outputDirectoryFallback: boolean;
  outputDirectoryError?: string;
}

export interface ResolveAIRuntimeWorkspaceInput {
  vaultPath?: string;
}

const trimTrailingSlash = (path: string): string => path.replace(/[\/]+$/, '');

export const joinWorkspacePath = (...parts: string[]): string => {
  const absolute = parts[0]?.startsWith('/');
  const joined = parts
    .map((part) => part.replace(/^[\/]+|[\/]+$/g, ''))
    .filter(Boolean)
    .join('/');
  return absolute ? `/${joined}` : joined;
};

export const isAbsoluteWorkspacePath = (path: string): boolean => /^([A-Za-z]:[\\/]|\/)/.test(path);

export const resolveWorkspacePath = (workspace: AIRuntimeWorkspaceContext | undefined, path: string): string => {
  if (isAbsoluteWorkspacePath(path)) return path;
  return joinWorkspacePath(workspace?.workingDirectory ?? '', path);
};

const ensureDirectory = async (path: string): Promise<string | undefined> => {
  try {
    await mkdir(path, { recursive: true });
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

export const resolveAIRuntimeWorkspace = async (input: ResolveAIRuntimeWorkspaceInput = {}): Promise<AIRuntimeWorkspaceContext> => {
  const fallbackRoot = joinWorkspacePath(trimTrailingSlash(await documentDir()), 'workgaga');
  const workingDirectory = trimTrailingSlash(input.vaultPath || fallbackRoot);
  const preferredOutputDirectory = joinWorkspacePath(workingDirectory, '.workgaga', 'outputs');
  const preferredTaskOutputDirectory = joinWorkspacePath(workingDirectory, '.workgaga', 'tasks');
  const preferredError = await ensureDirectory(preferredOutputDirectory)
    || await ensureDirectory(preferredTaskOutputDirectory);

  if (!preferredError) {
    return {
      workingDirectory,
      outputDirectory: preferredOutputDirectory,
      taskOutputDirectory: preferredTaskOutputDirectory,
      isFallback: !input.vaultPath,
      outputDirectoryFallback: false,
    };
  }

  const fallbackOutputDirectory = joinWorkspacePath(fallbackRoot, 'outputs');
  const fallbackTaskOutputDirectory = joinWorkspacePath(fallbackRoot, 'tasks');
  const fallbackError = await ensureDirectory(fallbackOutputDirectory)
    || await ensureDirectory(fallbackTaskOutputDirectory);
  if (fallbackError) throw new Error(fallbackError);

  return {
    workingDirectory,
    outputDirectory: fallbackOutputDirectory,
    taskOutputDirectory: fallbackTaskOutputDirectory,
    isFallback: !input.vaultPath,
    outputDirectoryFallback: true,
    outputDirectoryError: preferredError,
  };
};
