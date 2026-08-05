<template>
  <div class="explorer-panel">
    <div v-if="!knowledgeGraphStore.vaultPath" class="empty-state">
      <div class="empty-title">还没有打开知识库</div>
      <p>选择一个本地目录作为知识库，系统会自动识别其中的 Markdown 文档。</p>
      <button class="primary-action" @click="openKnowledgeBase">打开知识库</button>
      <section v-if="knowledgeGraphStore.vaults.length" class="other-vaults">
        <div class="other-vaults-title">其他知识库 · {{ knowledgeGraphStore.vaults.length }} 个</div>
        <button v-for="vault in knowledgeGraphStore.vaults" :key="vault.path" class="collapsed-vault" @click="switchKnowledgeBase(vault.path)">
          <span>▶ {{ vault.name }}</span><small>{{ vaultDocumentCount(vault.path) }} 篇</small>
        </button>
      </section>
    </div>

    <template v-else>
      <section class="current-vault">
        <button class="vault-heading" :title="knowledgeGraphStore.vaultPath" @click="documentsExpanded = !documentsExpanded">
          <span class="expand-icon">{{ documentsExpanded ? '▼' : '▶' }}</span>
          <span class="vault-name">{{ knowledgeGraphStore.vaultName }}</span>
          <span v-if="knowledgeGraphStore.loading" class="status-pill">同步中</span>
        </button>
        <div class="vault-meta">{{ documentNodes.length }} 篇文档 · {{ indexedTimeText }}</div>
      </section>

      <section v-if="documentsExpanded" class="document-section">
        <div class="document-toolbar">
          <span>文档</span>
          <button class="new-document-button" @click="createDocument">+ 新建</button>
        </div>
        <p v-if="knowledgeGraphStore.error" class="error-message">{{ knowledgeGraphStore.error }}</p>
        <div v-if="documentTree.length === 0" class="muted">暂无 Markdown 文档</div>
        <ul v-else class="tree-list">
          <li v-for="row in documentRows" :key="row.path" class="tree-item">
            <div class="tree-row" :class="{ directory: row.isDirectory, current: isCurrentDocument(row.filePath) }" :style="{ paddingLeft: `${row.depth * 14 + 4}px` }">
              <button class="tree-node-button" :title="row.filePath || row.path" @click="row.filePath && openDocument(row.filePath)">
                <span class="node-icon">{{ row.isDirectory ? (row.expanded ? '▼' : '▶') : 'MD' }}</span>
                <span class="node-name">{{ row.isDirectory ? row.name : row.name }}</span>
              </button>
              <button v-if="row.filePath" class="more-button" title="文档操作" @click.stop="toggleDocumentMenu(row.filePath)">⋯</button>
              <div v-if="activeMenuPath === row.filePath" class="document-menu">
                <button @click="beginRename(row.filePath, row.name)">重命名</button>
                <button class="danger-text" @click="deleteDocument(row.filePath, row.name)">删除</button>
              </div>
            </div>
            <div v-if="renamingPath === row.filePath" class="rename-row" :style="{ paddingLeft: `${row.depth * 14 + 28}px` }">
              <input ref="renameInput" v-model="renameValue" autofocus @keyup.enter="submitRename(row.filePath)" @keyup.esc="cancelRename" />
              <button title="保存" @click="submitRename(row.filePath)">✓</button>
              <button title="取消" @click="cancelRename">×</button>
              <small v-if="renameError">{{ renameError }}</small>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="otherVaults.length" class="other-vaults">
        <div class="other-vaults-title">其他知识库 · {{ otherVaults.length }} 个</div>
        <button v-for="vault in otherVaults" :key="vault.path" class="collapsed-vault" :title="vault.path" @click="switchKnowledgeBase(vault.path)">
          <span>▶ {{ vault.name }}</span><small>{{ vaultDocumentCount(vault.path) }} 篇</small>
        </button>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { exists, remove, rename } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { useFileStore, useKnowledgeGraphStore } from '../store';
import { WINDOW_EVENTS } from '../constants/events';
import { notifyError, notifySuccess } from '../utils/notifications';
import type { KnowledgeGraphNode } from './types';

interface TreeNode {
  name: string;
  path: string;
  filePath?: string;
  children: TreeNode[];
  expanded?: boolean;
}

interface TreeRow extends TreeNode {
  depth: number;
  isDirectory: boolean;
}

const knowledgeGraphStore = useKnowledgeGraphStore();
const fileStore = useFileStore();
const documentsExpanded = ref(true);
const activeMenuPath = ref<string | null>(null);
const renamingPath = ref<string | null>(null);
const renameValue = ref('');
const renameError = ref('');

const normalizePath = (path: string): string => path.replace(/\\/g, '/');

const formatTime = (time?: number | null): string => {
  if (!time) return '尚未完成索引';
  return `最近索引：${new Date(time).toLocaleString()}`;
};

const currentGraph = computed(() => {
  const currentPath = knowledgeGraphStore.vaultPath;
  if (!currentPath) return knowledgeGraphStore.graphData;
  const graphEntry = Object.entries(knowledgeGraphStore.graphByVault).find(
    ([path]) => normalizePath(path) === normalizePath(currentPath),
  );
  return graphEntry?.[1] || knowledgeGraphStore.graphData;
});

const documentNodes = computed(() => {
  const uniqueNodes = new Map<string, KnowledgeGraphNode & { path: string; relativePath: string }>();

  (currentGraph.value?.nodes || [])
    .filter((node): node is KnowledgeGraphNode & { path: string; relativePath: string } =>
      Boolean(node.exists && node.path && node.relativePath),
    )
    .forEach((node) => {
      const normalizedPath = normalizePath(node.path).toLowerCase();
      if (!uniqueNodes.has(normalizedPath)) uniqueNodes.set(normalizedPath, node);
    });

  return [...uniqueNodes.values()].sort((a, b) =>
    normalizePath(a.relativePath).localeCompare(normalizePath(b.relativePath), 'zh-CN'),
  );
});

const documentTree = computed<TreeNode[]>(() => {
  const roots: TreeNode[] = [];
  const directoryMap = new Map<string, TreeNode>();

  documentNodes.value.forEach((note) => {
    const parts = normalizePath(note.relativePath).split('/').filter(Boolean);
    let currentChildren = roots;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;

      if (isFile) {
        currentChildren.push({ name: part, path: currentPath, filePath: note.path, children: [] });
        return;
      }

      let directory = directoryMap.get(currentPath);
      if (!directory) {
        directory = { name: part, path: currentPath, children: [] };
        directoryMap.set(currentPath, directory);
        currentChildren.push(directory);
      }
      currentChildren = directory.children;
    });
  });

  const sortTree = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => {
        const aIsDir = a.children.length > 0 && !a.filePath;
        const bIsDir = b.children.length > 0 && !b.filePath;
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN');
      })
      .map((node) => ({ ...node, children: sortTree(node.children) }));

  return sortTree(roots);
});

const indexedTimeText = computed(() => formatTime(knowledgeGraphStore.lastIndexedAt).replace('最近索引：', ''));
const otherVaults = computed(() =>
  knowledgeGraphStore.vaults.filter((vault) => !isCurrentVault(vault.path)),
);

const vaultDocumentCount = (path: string): number => {
  const graphEntry = Object.entries(knowledgeGraphStore.graphByVault).find(
    ([graphPath]) => normalizePath(graphPath) === normalizePath(path),
  );
  const uniquePaths = new Set(
    (graphEntry?.[1]?.nodes || [])
      .filter((node) => node.exists && node.path)
      .map((node) => normalizePath(node.path!).toLowerCase()),
  );
  return uniquePaths.size;
};

const isCurrentDocument = (path?: string): boolean =>
  Boolean(path && fileStore.currentFilePath && normalizePath(path) === normalizePath(fileStore.currentFilePath));

const documentRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [];
  const flatten = (nodes: TreeNode[], depth: number): void => {
    nodes.forEach((node) => {
      rows.push({ ...node, depth, isDirectory: node.children.length > 0 && !node.filePath });
      flatten(node.children, depth + 1);
    });
  };

  flatten(documentTree.value, 0);
  return rows;
});

const notifyKnowledgeBaseChanged = (path: string): void => {
  window.dispatchEvent(new CustomEvent(WINDOW_EVENTS.KNOWLEDGE_BASE_CHANGED, { detail: { path } }));
};

const openKnowledgeBase = async (): Promise<void> => {
  try {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;

    const path = Array.isArray(selected) ? selected[0] : selected;
    await knowledgeGraphStore.setKnowledgeBase(path);
    notifyKnowledgeBaseChanged(path);
    notifySuccess('知识库已打开');
  } catch (error) {
    notifyError(`打开知识库失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const createDocument = (): void => {
  if (!knowledgeGraphStore.vaultPath) return;
  window.dispatchEvent(
    new CustomEvent(WINDOW_EVENTS.CREATE_DOCUMENT_IN_KNOWLEDGE_BASE, {
      detail: { path: knowledgeGraphStore.vaultPath },
    }),
  );
};

const openDocument = (path: string): void => {
  activeMenuPath.value = null;
  window.dispatchEvent(new CustomEvent('open-dashboard-link', { detail: { path } }));
};

const toggleDocumentMenu = (path: string): void => {
  activeMenuPath.value = activeMenuPath.value === path ? null : path;
};

const beginRename = async (path: string, name: string): Promise<void> => {
  activeMenuPath.value = null;
  renamingPath.value = path;
  renameValue.value = name.replace(/\.(md|markdown)$/i, '');
  renameError.value = '';
  await nextTick();
};

const cancelRename = (): void => {
  renamingPath.value = null;
  renameValue.value = '';
  renameError.value = '';
};

const submitRename = async (path: string): Promise<void> => {
  const value = renameValue.value.trim();
  if (!value) {
    renameError.value = '名称不能为空';
    return;
  }
  if (/[\\/:*?"<>|]/.test(value)) {
    renameError.value = '名称不能包含特殊字符';
    return;
  }
  const extension = path.match(/\.(md|markdown)$/i)?.[0] || '.md';
  const directory = path.replace(/[\\/]([^\\/]*)$/, '');
  const targetPath = `${directory}/${value}${extension}`;
  if (targetPath !== path && await exists(targetPath)) {
    renameError.value = '该目录下已存在同名文档';
    return;
  }
  if (targetPath === path) {
    cancelRename();
    return;
  }
  try {
    await rename(path, targetPath);
    fileStore.renameRecentFile(path, targetPath);
    window.dispatchEvent(new CustomEvent(WINDOW_EVENTS.DOCUMENT_RENAMED, { detail: { oldPath: path, newPath: targetPath } }));
    cancelRename();
    await knowledgeGraphStore.refresh();
    notifySuccess('文档已重命名');
  } catch (error) {
    renameError.value = `重命名失败：${error instanceof Error ? error.message : String(error)}`;
  }
};

const deleteDocument = async (path: string, name: string): Promise<void> => {
  activeMenuPath.value = null;
  if (!window.confirm(`确定要删除“${name}”吗？\\n\\n文档将从当前知识库中删除，此操作无法撤销。`)) return;
  try {
    await remove(path);
    fileStore.removeRecentFile(path);
    window.dispatchEvent(new CustomEvent(WINDOW_EVENTS.DOCUMENT_DELETED, { detail: { path } }));
    await knowledgeGraphStore.refresh();
    notifySuccess('文档已删除');
  } catch (error) {
    notifyError(`删除文档失败：${error instanceof Error ? error.message : String(error)}`);
  }
};

const switchKnowledgeBase = async (path: string): Promise<void> => {
  if (!path) return;
  activeMenuPath.value = null;
  renamingPath.value = null;
  documentsExpanded.value = true;
  try {
    await knowledgeGraphStore.switchKnowledgeBase(path);
    documentsExpanded.value = true;
    notifyKnowledgeBaseChanged(path);
  } catch (error) {
    notifyError(`切换知识库失败：${error instanceof Error ? error.message : String(error)}`);
  }
};

watch(
  () => knowledgeGraphStore.vaultPath,
  () => {
    documentsExpanded.value = true;
    activeMenuPath.value = null;
    renamingPath.value = null;
  },
);

const isCurrentVault = (path: string): boolean =>
  Boolean(knowledgeGraphStore.vaultPath && normalizePath(knowledgeGraphStore.vaultPath) === normalizePath(path));

defineExpose({ openKnowledgeBase });
</script>

<style scoped>
.current-vault {
  margin-bottom: 12px;
}

.vault-heading {
  width: 100%;
  border: none;
  padding: 0;
  background: transparent;
  color: #111827;
  cursor: pointer;
  text-align: left;
}

.expand-icon {
  display: inline-block;
  width: 18px;
  color: #6b7280;
  font-size: 11px;
}

.vault-name {
  font-size: 15px;
  font-weight: 700;
}

.vault-meta {
  margin: 5px 0 0 18px;
  color: #6b7280;
  font-size: 12px;
}

.document-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
}

.new-document-button,
.more-button,
.document-menu button,
.rename-row button {
  border: 1px solid #d8dee9;
  border-radius: 6px;
  background: #ffffff;
  color: #374151;
  cursor: pointer;
  font-size: 12px;
}

.new-document-button {
  padding: 5px 8px;
}

.tree-row {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: 6px;
}

.tree-row.current {
  background: #eef2ff;
}

.tree-row.directory .tree-node-button {
  color: #111827;
  font-weight: 600;
}

.more-button {
  flex: 0 0 auto;
  border: none;
  padding: 2px 6px;
  background: transparent;
  font-size: 16px;
}

.more-button:hover,
.new-document-button:hover {
  background: #eef2ff;
  color: #1d4ed8;
}

.document-menu {
  position: absolute;
  z-index: 2;
  top: calc(100% - 2px);
  right: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 76px;
  padding: 4px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 4px 12px rgb(15 23 42 / 12%);
}

.document-menu button {
  border: none;
  padding: 6px 8px;
  text-align: left;
}

.document-menu button:hover {
  background: #f3f4f6;
}

.danger-text {
  color: #dc2626 !important;
}

.rename-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0;
}

.rename-row input {
  min-width: 0;
  flex: 1;
  border: 1px solid #93c5fd;
  border-radius: 5px;
  padding: 4px 6px;
  font-size: 12px;
}

.rename-row button {
  width: 24px;
  height: 24px;
  padding: 0;
}

.rename-row small {
  color: #dc2626;
  font-size: 11px;
}

.other-vaults {
  margin-top: 18px;
}

.other-vaults-title {
  margin-bottom: 6px;
  color: #6b7280;
  font-size: 12px;
}

.collapsed-vault {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 3px 0;
  border: none;
  border-radius: 7px;
  padding: 7px 8px;
  background: transparent;
  color: #374151;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}

.collapsed-vault:hover {
  background: #f3f4f6;
}

.collapsed-vault small {
  color: #6b7280;
}

.explorer-panel {
  height: 100%;
  padding: 14px;
  box-sizing: border-box;
  background: #ffffff;
  overflow: auto;
  color: #111827;
}

.empty-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.empty-title {
  color: #111827;
  font-size: 15px;
  font-weight: 700;
}

.primary-action,
.action-row button,
.link-button,
.remove-button {
  border: 1px solid #d8dee9;
  border-radius: 8px;
  background: #f3f6fb;
  color: #1f2937;
  cursor: pointer;
  font-size: 12px;
}

.primary-action {
  align-self: flex-start;
  padding: 8px 12px;
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.vault-card,
.section-block {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  padding: 12px;
}

.vault-heading,
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.vault-label {
  color: #6b7280;
  font-size: 11px;
}

.vault-heading h4,
.section-header h4 {
  margin: 2px 0 0;
  font-size: 14px;
}

.status-pill {
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 3px 8px;
  font-size: 11px;
}

.vault-path {
  margin-top: 8px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.stats-grid div {
  padding: 8px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #edf0f5;
}

.stats-grid strong,
.stats-grid span {
  display: block;
}

.stats-grid strong {
  font-size: 18px;
}

.stats-grid span,
.indexed-time,
.muted,
.section-header span {
  color: #6b7280;
  font-size: 12px;
}

.indexed-time {
  margin-top: 8px;
}

.action-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 12px 0;
}

.action-row button {
  padding: 7px 8px;
}

.action-row button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  color: #dc2626;
  font-size: 12px;
  line-height: 1.5;
}

.document-section,
.vault-list-section {
  margin-top: 12px;
}

.tree-list,
.vault-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.tree-item {
  margin: 2px 0;
}

.tree-node-button {
  width: 100%;
  border: none;
  background: transparent;
  color: #374151;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.7;
  overflow: hidden;
  padding: 3px 4px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-node-button.directory {
  color: #111827;
  font-weight: 600;
}

.tree-node-button:hover {
  background: #eef2ff;
  border-radius: 6px;
  color: #1d4ed8;
}

.vault-item {
  display: flex;
  gap: 8px;
  align-items: center;
  border-radius: 10px;
  padding: 6px;
}

.vault-item.active {
  background: #eef2ff;
}

.vault-switch {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.vault-switch strong,
.vault-switch span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vault-switch strong {
  color: #111827;
  font-size: 12px;
}

.vault-switch span {
  color: #6b7280;
  font-size: 11px;
}

.remove-button,
.link-button {
  padding: 5px 8px;
}

.link-button {
  border: none;
  background: transparent;
  color: #2563eb;
}
</style>
