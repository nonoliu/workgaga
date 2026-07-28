import { mkdir, writeTextFile } from '@tauri-apps/plugin-fs';
import type { AIRuntimeWorkspaceContext } from '../workspace';
import { joinWorkspacePath } from '../workspace';

export const getAIAgentTaskOutputPath = (workspace: AIRuntimeWorkspaceContext | undefined, taskId: string): string | undefined => (
  workspace ? joinWorkspacePath(workspace.taskOutputDirectory, `${taskId}.output.md`) : undefined
);

export const writeAIAgentTaskOutput = async (workspace: AIRuntimeWorkspaceContext | undefined, taskId: string, content: string): Promise<string | undefined> => {
  const outputFile = getAIAgentTaskOutputPath(workspace, taskId);
  if (!outputFile || !workspace) return undefined;
  await mkdir(workspace.taskOutputDirectory, { recursive: true });
  await writeTextFile(outputFile, content);
  return outputFile;
};
