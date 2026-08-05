import type { AIKnowledgeSnippet } from "../store/modal/aiAssistant";
import type { KnowledgeGraphData, KnowledgeNote } from "../components/types";

export interface AIKnowledgeRetrievalOptions {
  currentFilePath?: string | null;
  recentFilePaths?: string[];
  maxSnippets?: number;
  graphData?: KnowledgeGraphData | null;
  includeGraphNeighbors?: boolean;
  graphNeighborBoost?: number;
}

const COMMON_CHINESE_WORDS = [
  "项目",
  "计划",
  "规划",
  "方案",
  "会议",
  "纪要",
  "复盘",
  "总结",
  "知识",
  "沉淀",
  "经验",
  "方法",
  "原则",
  "风险",
  "需求",
  "设计",
  "开发",
  "测试",
  "发布",
  "用户",
  "产品",
  "运营",
  "任务",
  "待办",
];

const normalizePath = (path: string): string =>
  path.replace(/\\/g, "/").toLowerCase();

export const tokenizeForKnowledgeSearch = (input: string): string[] => {
  const normalized = input.toLowerCase();
  const latinTokens = normalized.match(/[a-z0-9_\-]{2,}/g) || [];
  const chineseTokens = normalized.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const segmentedChineseTokens: string[] = [];

  for (const token of chineseTokens) {
    for (const word of COMMON_CHINESE_WORDS) {
      if (token.includes(word)) segmentedChineseTokens.push(word);
    }
    for (let size = 2; size <= Math.min(4, token.length); size += 1) {
      for (let index = 0; index <= token.length - size; index += 1) {
        segmentedChineseTokens.push(token.slice(index, index + size));
      }
    }
  }

  return Array.from(
    new Set([...latinTokens, ...chineseTokens, ...segmentedChineseTokens]),
  )
    .filter((token) => token.length >= 2)
    .slice(0, 40);
};

const buildKnowledgeSnippet = (content: string, tokens: string[]): string => {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return content.slice(0, 500);

  const matchedIndex = lines.findIndex((line) => {
    const lowerLine = line.toLowerCase();
    return tokens.some((token) => lowerLine.includes(token));
  });
  const start = Math.max(0, matchedIndex >= 0 ? matchedIndex - 1 : 0);
  return lines
    .slice(start, start + 4)
    .join("\n")
    .slice(0, 500);
};

const countTokenHits = (text: string, tokens: string[]): number =>
  tokens.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0);

const pathMatchesCurrentFile = (
  relativePath: string,
  currentFilePath?: string | null,
): boolean => {
  const currentPath = currentFilePath ? normalizePath(currentFilePath) : "";
  if (!currentPath) return false;
  const normalizedRelativePath = normalizePath(relativePath);
  return (
    currentPath.endsWith(`/${normalizedRelativePath}`) ||
    currentPath.endsWith(normalizedRelativePath)
  );
};

const recentFileBoost = (
  relativePath: string,
  recentFilePaths: string[] = [],
): number => {
  const normalizedRelativePath = normalizePath(relativePath);
  const index = recentFilePaths.findIndex((path) =>
    normalizePath(path).endsWith(`/${normalizedRelativePath}`),
  );
  if (index < 0) return 0;
  return Math.max(1, 5 - index);
};

const buildGraphNeighborBoosts = (
  graphData?: KnowledgeGraphData | null,
): Map<string, number> => {
  const boosts = new Map<string, number>();
  if (!graphData) return boosts;
  const noteIds = new Set(
    (graphData.notes || []).map((note) => normalizePath(note.relativePath)),
  );
  const noteIdByGraphId = new Map(
    (graphData.notes || []).map((note) => [
      note.id,
      normalizePath(note.relativePath),
    ]),
  );
  graphData.links.forEach((link) => {
    const source = noteIdByGraphId.get(link.source);
    const target = noteIdByGraphId.get(link.target);
    if (source && noteIds.has(source) && target) {
      boosts.set(target, (boosts.get(target) || 0) + 1);
    }
    if (target && noteIds.has(target) && source) {
      boosts.set(source, (boosts.get(source) || 0) + 1);
    }
  });
  return boosts;
};

export const retrieveAIKnowledgeSnippets = (
  input: string,
  notes: KnowledgeNote[] = [],
  options: AIKnowledgeRetrievalOptions = {},
): AIKnowledgeSnippet[] => {
  if (!notes.length) return [];

  const tokens = tokenizeForKnowledgeSearch(input);
  if (!tokens.length) return [];

  const maxSnippets = Math.max(0, options.maxSnippets ?? 5);
  if (maxSnippets === 0) return [];
  const graphNeighborBoosts = options.includeGraphNeighbors
    ? buildGraphNeighborBoosts(options.graphData)
    : new Map<string, number>();
  const graphNeighborBoost = options.graphNeighborBoost ?? 2;

  return notes
    .map((note) => {
      const title = note.title.toLowerCase();
      const relativePath = note.relativePath.toLowerCase();
      const fileName = relativePath.split("/").pop() || relativePath;
      const content = note.content.toLowerCase();
      const titleHits = countTokenHits(title, tokens);
      const fileNameHits = countTokenHits(fileName, tokens);
      const pathHits = countTokenHits(relativePath, tokens);
      const contentHits = countTokenHits(content, tokens);
      const currentBoost = pathMatchesCurrentFile(
        note.relativePath,
        options.currentFilePath,
      )
        ? 10
        : 0;
      const recentBoost = recentFileBoost(
        note.relativePath,
        options.recentFilePaths,
      );
      const exactTitleBoost = tokens.some(
        (token) =>
          title === token ||
          fileName.replace(/\.(md|markdown)$/i, "") === token,
      )
        ? 8
        : 0;
      const graphBoost =
        (graphNeighborBoosts.get(normalizePath(note.relativePath)) || 0) *
        graphNeighborBoost;
      const score =
        exactTitleBoost +
        currentBoost +
        recentBoost +
        graphBoost +
        titleHits * 8 +
        fileNameHits * 7 +
        pathHits * 3 +
        contentHits;

      return {
        score,
        snippet: {
          title: note.title,
          path: note.relativePath,
          content: buildKnowledgeSnippet(note.content, tokens),
        },
      };
    })
    .filter((item) => item.score > 0 && item.snippet.content.trim())
    .sort((left, right) => right.score - left.score)
    .slice(0, maxSnippets)
    .map((item) => item.snippet);
};
