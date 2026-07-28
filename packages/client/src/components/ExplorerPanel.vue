<template>
  <div class="explorer-panel">
    <div v-if="!knowledgeGraphStore.vaultPath" class="empty-state">
      <div class="empty-title">还没有打开知识库</div>
      <p>选择一个本地目录作为知识库，系统会自动识别其中的 Markdown 文档。</p>
      <button class="primary-action" @click="openKnowledgeBase">打开知识库</button>

      <section v-if="knowledgeGraphStore.vaults.length" class="section-block vault-list-section">
        <div class="section-header">
          <h4>已添加知识库</h4>
          <span>{{ knowledgeGraphStore.vaults.length }} 个</span>
        </div>
        <ul class="vault-list">
          <li v-for="vault in knowledgeGraphStore.vaults" :key="vault.path" class="vault-item">
            <button class="vault-switch" :title="vault.path" @click="switchKnowledgeBase(vault.path)">
              <strong>{{ vault.name }}</strong>
              <span>{{ vault.path }}</span>
            </button>
            <button class="remove-button" title="移除记录" @click="removeKnowledgeBase(vault.path)">移除</button>
          </li>
        </ul>
      </section>
    </div>

    <template v-else>
      <section class="vault-card">
        <div class="vault-heading">
          <div>
            <div class="vault-label">当前知识库</div>
            <h4>{{ knowledgeGraphStore.vaultName }}</h4>
          </div>
          <span v-if="knowledgeGraphStore.loading" class="status-pill">索引中</span>
        </div>
        <div class="vault-path" :title="knowledgeGraphStore.vaultPath">{{ knowledgeGraphStore.vaultPath }}</div>
        <div class="stats-grid">
          <div>
            <strong>{{ knowledgeGraphStore.noteCount }}</strong>
            <span>文档</span>
          </div>
          <div>
            <strong>{{ knowledgeGraphStore.linkCount }}</strong>
            <span>连接</span>
          </div>
          <div>
            <strong>{{ knowledgeGraphStore.missingCount }}</strong>
            <span>缺失</span>
          </div>
        </div>
        <div class="indexed-time">{{ indexedTimeText }}</div>
      </section>

      <section class="action-row">
        <button @click="createDocument">新建文档</button>
        <button :disabled="knowledgeGraphStore.loading" @click="refreshKnowledgeBase">刷新索引</button>
        <button @click="openKnowledgeBase">切换知识库</button>
      </section>

      <p v-if="knowledgeGraphStore.error" class="error-message">{{ knowledgeGraphStore.error }}</p>

      <section class="section-block document-section">
        <div class="section-header">
          <h4>知识库文档</h4>
          <span>{{ documentNodes.length }} 篇</span>
        </div>
        <div v-if="documentTree.length === 0" class="muted">暂无 Markdown 文档。</div>
        <ul v-else class="tree-list">
          <li v-for="row in documentRows" :key="row.path" class="tree-item">
            <button
              class="tree-node-button"
              :class="{ directory: row.isDirectory }"
              :style="{ paddingLeft: `${row.depth * 14 + 4}px` }"
              :title="row.filePath || row.path"
              @click="row.filePath && openDocument(row.filePath)"
            >
              {{ row.isDirectory ? `${row.name}/` : row.name }}
            </button>
          </li>
        </ul>
      </section>

      <section v-if="knowledgeGraphStore.vaults.length" class="section-block vault-list-section">
        <div class="section-header">
          <h4>已添加知识库</h4>
          <button class="link-button" @click="closeKnowledgeBase">关闭当前</button>
        </div>
        <ul class="vault-list">
          <li
            v-for="vault in knowledgeGraphStore.vaults"
            :key="vault.path"
            class="vault-item"
            :class="{ active: isCurrentVault(vault.path) }"
          >
            <button class="vault-switch" :title="vault.path" @click="switchKnowledgeBase(vault.path)">
              <strong>{{ vault.name }}</strong>
              <span>{{ vault.path }}</span>
            </button>
            <button class="remove-button" title="移除记录" @click="removeKnowledgeBase(vault.path)">移除</button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { useKnowledgeGraphStore } from '../store';
import { WINDOW_EVENTS } from '../constants/events';
import { notifyError, notifySuccess } from '../utils/notifications';
import type { KnowledgeGraphNode } from './types';

interface TreeNode {
  name: string;
  path: string;
  filePath?: string;
  children: TreeNode[];
}

interface TreeRow extends TreeNode {
  depth: number;
  isDirectory: boolean;
}

const knowledgeGraphStore = useKnowledgeGraphStore();

const normalizePath = (path: string): string => path.replace(/\\/g, '/');

const formatTime = (time?: number | null): string => {
  if (!time) return '尚未完成索引';
  return `最近索引：${new Date(time).toLocaleString()}`;
};

const documentNodes = computed(() =>
  (knowledgeGraphStore.graphData?.nodes || [])
    .filter((node): node is KnowledgeGraphNode & { path: string; relativePath: string } =>
      Boolean(node.exists && node.path && node.relativePath),
    )
    .sort((a, b) => normalizePath(a.relativePath).localeCompare(normalizePath(b.relativePath), 'zh-CN')),
);

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

const indexedTimeText = computed(() => formatTime(knowledgeGraphStore.lastIndexedAt));

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

const refreshKnowledgeBase = async (): Promise<void> => {
  await knowledgeGraphStore.refresh();
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
  window.dispatchEvent(new CustomEvent('open-dashboard-link', { detail: { path } }));
};

const switchKnowledgeBase = async (path: string): Promise<void> => {
  if (isCurrentVault(path)) return;
  await knowledgeGraphStore.switchKnowledgeBase(path);
  notifyKnowledgeBaseChanged(path);
};

const removeKnowledgeBase = (path: string): void => {
  knowledgeGraphStore.removeKnowledgeBase(path);
};

const closeKnowledgeBase = (): void => {
  knowledgeGraphStore.closeKnowledgeBase();
};

const isCurrentVault = (path: string): boolean =>
  Boolean(knowledgeGraphStore.vaultPath && normalizePath(knowledgeGraphStore.vaultPath) === normalizePath(path));

defineExpose({ openKnowledgeBase });
</script>

<style scoped>
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
