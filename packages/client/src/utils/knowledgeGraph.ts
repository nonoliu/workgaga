import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import type { KnowledgeGraphData, KnowledgeGraphLink, KnowledgeGraphNode, KnowledgeNote } from '../components/types';

interface ParsedLink {
  target: string;
  raw: string;
  type: 'wiki' | 'markdown';
}

const MARKDOWN_EXTENSIONS = ['md', 'markdown'];
const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules', '.obsidian', 'dist', 'target']);
const MAX_KNOWLEDGE_DEPTH = 32;

export const normalizePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+/g, '/');

const trimTrailingSlash = (path: string): string => normalizePath(path).replace(/\/+$/, '');

const joinPath = (base: string, name: string): string => `${trimTrailingSlash(base)}/${name}`;

const dirname = (path: string): string => {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
};

const basename = (path: string): string => {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(index + 1) : normalized;
};

const stripMarkdownExtension = (path: string): string => path.replace(/\.(md|markdown)$/i, '');

const hasMarkdownExtension = (path: string): boolean =>
  MARKDOWN_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(`.${ext}`));

const normalizeRelativePath = (path: string): string => {
  const parts: string[] = [];
  normalizePath(path)
    .split('/')
    .filter(Boolean)
    .forEach((part) => {
      if (part === '.') return;
      if (part === '..') {
        parts.pop();
        return;
      }
      parts.push(part);
    });
  return parts.join('/');
};

export const getRelativePath = (vaultPath: string, filePath: string): string => {
  const root = trimTrailingSlash(vaultPath);
  const normalizedFile = normalizePath(filePath);
  return normalizedFile.startsWith(`${root}/`) ? normalizedFile.slice(root.length + 1) : basename(normalizedFile);
};

export const getNoteTitle = (path: string): string => stripMarkdownExtension(basename(path));

const extractWikiLinks = (content: string): ParsedLink[] => {
  const links: ParsedLink[] = [];
  const regexp = /\[\[([^\]\n]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = regexp.exec(content)) !== null) {
    const rawTarget = match[1].split('|')[0].split('#')[0].trim();
    if (!rawTarget) continue;
    links.push({ target: normalizePath(rawTarget), raw: match[0], type: 'wiki' });
  }

  return links;
};

const isExternalMarkdownTarget = (target: string): boolean => /^(https?:|mailto:|tel:|file:|data:)/i.test(target);

const extractMarkdownLinks = (content: string, currentRelativePath: string): ParsedLink[] => {
  const links: ParsedLink[] = [];
  const regexp = /(?<!!)\[[^\]\n]*\]\(([^)\n]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = regexp.exec(content)) !== null) {
    const cleanTarget = match[1].trim().replace(/^<|>$/g, '').split('#')[0].split('?')[0].trim();
    if (!cleanTarget || cleanTarget.startsWith('#') || isExternalMarkdownTarget(cleanTarget)) continue;

    const currentDir = dirname(currentRelativePath);
    const target = normalizeRelativePath(currentDir ? `${currentDir}/${cleanTarget}` : cleanTarget);
    links.push({ target, raw: match[0], type: 'markdown' });
  }

  return links;
};

const buildNoteIndexes = (notes: KnowledgeNote[]) => {
  const byRelativePath = new Map<string, KnowledgeNote>();
  const byStemPath = new Map<string, KnowledgeNote[]>();
  const byTitle = new Map<string, KnowledgeNote[]>();

  notes.forEach((note) => {
    const relativePath = normalizePath(note.relativePath);
    const stemPath = stripMarkdownExtension(relativePath);
    const title = note.title.toLowerCase();

    byRelativePath.set(relativePath.toLowerCase(), note);
    byStemPath.set(stemPath.toLowerCase(), [...(byStemPath.get(stemPath.toLowerCase()) || []), note]);
    byTitle.set(title, [...(byTitle.get(title) || []), note]);
  });

  return { byRelativePath, byStemPath, byTitle };
};

const resolveLinkTarget = (
  link: ParsedLink,
  source: KnowledgeNote,
  indexes: ReturnType<typeof buildNoteIndexes>,
): KnowledgeNote | null => {
  const rawTarget = normalizeRelativePath(link.target);
  const sourceDir = dirname(source.relativePath);
  const sameDirTarget = sourceDir && !rawTarget.includes('/') ? `${sourceDir}/${rawTarget}` : rawTarget;
  const candidates = [sameDirTarget, rawTarget];

  for (const candidate of candidates) {
    const normalized = normalizePath(candidate).toLowerCase();
    const direct = indexes.byRelativePath.get(normalized);
    if (direct) return direct;

    for (const ext of MARKDOWN_EXTENSIONS) {
      const withExt = indexes.byRelativePath.get(`${normalized}.${ext}`);
      if (withExt) return withExt;
    }

    const stemMatches = indexes.byStemPath.get(stripMarkdownExtension(normalized));
    if (stemMatches?.length) return stemMatches[0];
  }

  if (!rawTarget.includes('/')) {
    const titleMatches = indexes.byTitle.get(stripMarkdownExtension(rawTarget).toLowerCase());
    if (titleMatches?.length) return titleMatches[0];
  }

  return null;
};

const createMissingNodeId = (source: KnowledgeNote, target: string): string => {
  const sourceDir = dirname(source.relativePath);
  const normalized = normalizeRelativePath(target.includes('/') || !sourceDir ? target : `${sourceDir}/${target}`);
  return `missing:${stripMarkdownExtension(normalized)}`;
};

export const buildKnowledgeGraph = (notes: KnowledgeNote[]): KnowledgeGraphData => {
  const indexes = buildNoteIndexes(notes);
  const nodes = new Map<string, KnowledgeGraphNode>();
  const links = new Map<string, KnowledgeGraphLink>();

  notes.forEach((note) => {
    nodes.set(note.id, {
      id: note.id,
      name: note.title,
      path: note.path,
      relativePath: note.relativePath,
      exists: true,
      category: 'note',
    });
  });

  notes.forEach((note) => {
    const parsedLinks = [...extractWikiLinks(note.content), ...extractMarkdownLinks(note.content, note.relativePath)];

    parsedLinks.forEach((link) => {
      const targetNote = resolveLinkTarget(link, note, indexes);
      const targetId = targetNote?.id || createMissingNodeId(note, link.target);

      if (!targetNote && !nodes.has(targetId)) {
        nodes.set(targetId, {
          id: targetId,
          name: getNoteTitle(link.target),
          relativePath: targetId.replace(/^missing:/, ''),
          exists: false,
          category: 'missing',
        });
      }

      const linkId = `${note.id}->${targetId}:${link.type}:${link.raw}`;
      links.set(linkId, {
        source: note.id,
        target: targetId,
        type: link.type,
        raw: link.raw,
      });
    });
  });

  return {
    nodes: Array.from(nodes.values()),
    links: Array.from(links.values()),
    notes,
    indexedAt: Date.now(),
  };
};

const scanMarkdownFiles = async (vaultPath: string, currentPath: string, depth: number): Promise<KnowledgeNote[]> => {
  if (depth > MAX_KNOWLEDGE_DEPTH) return [];

  const entries = await readDir(currentPath);
  const notes: KnowledgeNote[] = [];

  for (const entry of entries) {
    if (!entry.name) continue;

    const fullPath = joinPath(currentPath, entry.name);

    if (entry.isDirectory) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const children = await scanMarkdownFiles(vaultPath, fullPath, depth + 1);
      notes.push(...children);
      continue;
    }

    if (!hasMarkdownExtension(entry.name)) continue;

    try {
      const content = await readTextFile(fullPath);
      const relativePath = getRelativePath(vaultPath, fullPath);
      notes.push({
        id: normalizePath(relativePath),
        path: fullPath,
        relativePath,
        title: getNoteTitle(relativePath),
        content,
      });
    } catch (error) {
      console.warn('读取知识库文件失败:', fullPath, error);
    }
  }

  return notes;
};

export const indexKnowledgeVault = async (vaultPath: string): Promise<KnowledgeGraphData> => {
  const notes = await scanMarkdownFiles(vaultPath, vaultPath, 0);
  return buildKnowledgeGraph(notes);
};
