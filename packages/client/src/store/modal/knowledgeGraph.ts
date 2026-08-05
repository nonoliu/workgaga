import { defineStore } from "pinia";
import type {
  KnowledgeGraphData,
  KnowledgeVault,
} from "../../components/types";
import type { KnowledgeFileSnapshot } from "../../utils/knowledgeGraph";
import { extractFileName } from "../../components/fileUtils";
import {
  indexKnowledgeVault,
  mergeKnowledgeGraphData,
} from "../../utils/knowledgeGraph";

interface KnowledgeGraphState {
  vaultPath: string | null;
  vaults: KnowledgeVault[];
  graphData: KnowledgeGraphData | null;
  loading: boolean;
  refreshPending: boolean;
  error: string | null;
  lastIndexedAt: number | null;
  fileSnapshots: KnowledgeFileSnapshot[];
  graphByVault: Record<string, KnowledgeGraphData>;
  scanWarnings: string[];
}

const STORAGE_KEYS = {
  VAULT_PATH: "cherry_markdown_knowledge_vault_path",
  VAULTS: "cherry_markdown_knowledge_vaults",
  LAST_INDEXED_AT: "cherry_markdown_knowledge_last_indexed_at",
};

const getKnowledgeBaseName = (path: string): string =>
  extractFileName(path.replace(/[\\/]+$/, "")) || path;

const normalizePath = (path: string): string =>
  path.replace(/\\/g, "/").replace(/\/+$/, "");

const loadVaultPath = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEYS.VAULT_PATH);
  } catch {
    return null;
  }
};

const loadVaults = (): KnowledgeVault[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.VAULTS);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.path === "string")
      .map((item) => ({
        path: item.path,
        name:
          typeof item.name === "string" && item.name
            ? item.name
            : getKnowledgeBaseName(item.path),
        lastIndexedAt:
          typeof item.lastIndexedAt === "number"
            ? item.lastIndexedAt
            : undefined,
      }));
  } catch (error) {
    console.warn("加载知识库列表失败:", error);
    return [];
  }
};

const loadLastIndexedAt = (): number | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.LAST_INDEXED_AT);
    return value ? Number(value) : null;
  } catch {
    return null;
  }
};

const saveVaultPath = (path: string | null): void => {
  try {
    if (path) {
      localStorage.setItem(STORAGE_KEYS.VAULT_PATH, path);
    } else {
      localStorage.removeItem(STORAGE_KEYS.VAULT_PATH);
    }
  } catch (error) {
    console.warn("保存知识库路径失败:", error);
  }
};

const saveVaults = (vaults: KnowledgeVault[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.VAULTS, JSON.stringify(vaults));
  } catch (error) {
    console.warn("保存知识库列表失败:", error);
  }
};

const saveLastIndexedAt = (time: number | null): void => {
  try {
    if (time) {
      localStorage.setItem(STORAGE_KEYS.LAST_INDEXED_AT, String(time));
    } else {
      localStorage.removeItem(STORAGE_KEYS.LAST_INDEXED_AT);
    }
  } catch (error) {
    console.warn("保存知识库索引时间失败:", error);
  }
};

const createInitialVaults = (): KnowledgeVault[] => {
  const vaults = loadVaults();
  const currentPath = loadVaultPath();
  if (!currentPath) return vaults;

  const exists = vaults.some(
    (vault) => normalizePath(vault.path) === normalizePath(currentPath),
  );
  return exists
    ? vaults
    : [
        { path: currentPath, name: getKnowledgeBaseName(currentPath) },
        ...vaults,
      ];
};

export const useKnowledgeGraphStore = defineStore("knowledgeGraph", {
  state: (): KnowledgeGraphState => ({
    vaultPath: loadVaultPath(),
    vaults: createInitialVaults(),
    graphData: null,
    loading: false,
    refreshPending: false,
    error: null,
    lastIndexedAt: loadLastIndexedAt(),
    fileSnapshots: [],
    graphByVault: {},
    scanWarnings: [],
  }),

  getters: {
    vaultName: (state) =>
      state.vaultPath ? getKnowledgeBaseName(state.vaultPath) : "",
    currentVault: (state) =>
      state.vaults.find(
        (vault) =>
          state.vaultPath &&
          normalizePath(vault.path) === normalizePath(state.vaultPath),
      ) || null,
    knowledgeBaseForPath: (state) => (filePath: string) => {
      const normalizedFilePath = normalizePath(filePath);
      return (
        state.vaults.find((vault) => {
          const normalizedVaultPath = normalizePath(vault.path);
          return (
            normalizedFilePath === normalizedVaultPath ||
            normalizedFilePath.startsWith(`${normalizedVaultPath}/`)
          );
        }) || null
      );
    },
    noteCount: (state) =>
      state.graphData?.nodes.filter((node) => node.exists).length || 0,
    missingCount: (state) =>
      state.graphData?.nodes.filter((node) => !node.exists).length || 0,
    linkCount: (state) => state.graphData?.links.length || 0,
  },

  actions: {
    upsertKnowledgeBase(path: string, lastIndexedAt?: number) {
      const normalizedPath = normalizePath(path);
      const existingIndex = this.vaults.findIndex(
        (vault) => normalizePath(vault.path) === normalizedPath,
      );
      const vault = {
        path,
        name: getKnowledgeBaseName(path),
        lastIndexedAt,
      };

      if (existingIndex >= 0) {
        this.vaults[existingIndex] = {
          ...this.vaults[existingIndex],
          ...vault,
        };
      } else {
        this.vaults.unshift(vault);
      }

      saveVaults(this.vaults);
    },

    async setVault(path: string | null) {
      const previousIndexedAt = path
        ? this.vaults.find(
            (vault) => normalizePath(vault.path) === normalizePath(path),
          )?.lastIndexedAt
        : undefined;
      this.vaultPath = path;
      this.graphData = null;
      this.fileSnapshots = [];
      this.graphByVault = {};
      this.scanWarnings = [];
      this.error = null;
      this.lastIndexedAt = previousIndexedAt ?? null;
      saveVaultPath(path);

      if (path) {
        this.upsertKnowledgeBase(path, previousIndexedAt);
        await this.indexVault();
      } else {
        saveLastIndexedAt(null);
      }
    },

    async indexVault() {
      if (!this.vaultPath) return;
      if (this.loading) {
        this.refreshPending = true;
        return;
      }

      this.loading = true;
      this.refreshPending = false;
      this.error = null;

      try {
        const vaultsToIndex = this.vaults.length
          ? this.vaults
          : [
              {
                path: this.vaultPath,
                name: getKnowledgeBaseName(this.vaultPath),
              },
            ];
        const results = await Promise.allSettled(
          vaultsToIndex.map(async (vault) => ({
            vaultPath: vault.path,
            graph: await indexKnowledgeVault(vault.path),
          })),
        );
        const successfulGraphs = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const warnings = results.flatMap((result, index) =>
          result.status === "rejected"
            ? [`${vaultsToIndex[index].path}: ${String(result.reason)}`]
            : [],
        );
        if (!successfulGraphs.length) {
          throw new Error("所有知识库均未能完成索引");
        }
        const graphData = mergeKnowledgeGraphData(successfulGraphs);
        graphData.indexStats = {
          ...graphData.indexStats!,
          warnings: [...graphData.indexStats!.warnings, ...warnings],
          failedFiles: graphData.indexStats!.failedFiles + warnings.length,
        };
        this.graphData = graphData;
        this.graphByVault = Object.fromEntries(
          successfulGraphs.map(({ vaultPath, graph }) => [vaultPath, graph]),
        );
        this.scanWarnings = graphData.indexStats.warnings;
        this.lastIndexedAt = graphData.indexedAt;
        this.fileSnapshots = (graphData.notes || []).map((note) => ({
          path: note.path,
          relativePath: note.relativePath,
          size: note.size || 0,
          mtime: note.mtime ?? null,
        }));
        successfulGraphs.forEach(({ vaultPath, graph }) =>
          this.upsertKnowledgeBase(vaultPath, graph.indexedAt),
        );
        saveLastIndexedAt(graphData.indexedAt);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
        if (this.refreshPending) {
          this.refreshPending = false;
          await this.indexVault();
        }
      }
    },

    async refresh() {
      await this.indexVault();
    },

    async setKnowledgeBase(path: string | null) {
      await this.setVault(path);
    },

    async switchKnowledgeBase(path: string) {
      await this.setVault(path);
    },

    closeKnowledgeBase() {
      this.clear();
    },

    removeKnowledgeBase(path: string) {
      const normalizedPath = normalizePath(path);
      this.vaults = this.vaults.filter(
        (vault) => normalizePath(vault.path) !== normalizedPath,
      );
      saveVaults(this.vaults);
      if (this.vaultPath && normalizePath(this.vaultPath) === normalizedPath) {
        this.clear();
      }
    },

    clear() {
      this.vaultPath = null;
      this.graphData = null;
      this.fileSnapshots = [];
      this.graphByVault = {};
      this.scanWarnings = [];
      this.error = null;
      this.lastIndexedAt = null;
      saveVaultPath(null);
      saveLastIndexedAt(null);
    },
  },
});
