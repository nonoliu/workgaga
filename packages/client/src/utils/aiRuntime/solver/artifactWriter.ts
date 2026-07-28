import { mkdir, writeTextFile } from '@tauri-apps/plugin-fs';
import type { AIRuntimeWorkspaceContext } from '../workspace';
import { joinWorkspacePath } from '../workspace';

const sanitizeName = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 80) || '受限结果';

export const writeDegradedAnswerArtifact = async (params: {
  workspace: AIRuntimeWorkspaceContext;
  title: string;
  content: string;
}): Promise<string> => {
  await mkdir(params.workspace.outputDirectory, { recursive: true });
  const fileName = `${sanitizeName(params.title)}-${Date.now()}.md`;
  const path = joinWorkspacePath(params.workspace.outputDirectory, fileName);
  await writeTextFile(path, params.content);
  return path;
};
