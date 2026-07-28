import { appDataDir } from '@tauri-apps/api/path';
import { mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { AIRuntimeRole } from './types';

export interface AITranscriptRecord {
  id: string;
  parentId?: string;
  conversationId: string;
  role: AIRuntimeRole;
  content: string;
  status?: string;
  visible: boolean;
  apiVisible: boolean;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

const safeSegment = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, '-');

export const getAITranscriptRootDir = async (): Promise<string> => `${(await appDataDir()).replace(/[\\/]+$/, '')}/ai-transcripts`;

export const getAITranscriptPath = async (conversationId: string): Promise<string> => (
  `${await getAITranscriptRootDir()}/${safeSegment(conversationId)}.jsonl`
);

const readExistingTranscript = async (path: string): Promise<string> => {
  try {
    return await readTextFile(path);
  } catch {
    return '';
  }
};

export const appendAITranscriptRecord = async (record: AITranscriptRecord): Promise<void> => {
  const root = await getAITranscriptRootDir();
  await mkdir(root, { recursive: true });
  const path = await getAITranscriptPath(record.conversationId);
  const existing = await readExistingTranscript(path);
  const line = JSON.stringify(record);
  await writeTextFile(path, existing ? `${existing.replace(/\n*$/, '')}\n${line}\n` : `${line}\n`);
};

export const readAITranscript = async (conversationId: string): Promise<AITranscriptRecord[]> => {
  const path = await getAITranscriptPath(conversationId);
  const content = await readExistingTranscript(path);
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as AITranscriptRecord;
      } catch {
        return null;
      }
    })
    .filter((item): item is AITranscriptRecord => Boolean(item));
};

export const toApiVisibleTranscriptMessages = (records: AITranscriptRecord[]) => records
  .filter((record) => record.apiVisible)
  .map((record) => ({ role: record.role, content: record.content }));
