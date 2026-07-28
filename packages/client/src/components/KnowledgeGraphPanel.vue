<template>
  <div class="knowledge-graph-panel">
    <div v-if="graphStore.loading" class="empty-state">正在识别知识图谱...</div>
    <div v-else-if="graphStore.error" class="empty-state error">{{ graphStore.error }}</div>
    <div v-else-if="!graphStore.vaultPath" class="empty-state">请先打开知识库</div>
    <template v-else>
      <section class="graph-card">
        <div class="graph-heading">
          <div>
            <div class="graph-label">知识图谱</div>
            <h4>{{ graphStore.vaultName }}</h4>
          </div>
          <button :disabled="graphStore.loading" @click="refreshGraph">刷新</button>
        </div>
        <div class="indexed-time">{{ indexedTimeText }}</div>
        <div class="graph-summary">
          <div class="summary-item">
            <span class="summary-value">{{ graphStore.noteCount }}</span>
            <span class="summary-label">文档</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{{ graphStore.linkCount }}</span>
            <span class="summary-label">连接</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{{ graphStore.missingCount }}</span>
            <span class="summary-label">缺失</span>
          </div>
        </div>
      </section>

      <section class="graph-section">
        <div class="section-header">
          <h4>缺失链接</h4>
          <span>{{ missingNodes.length }} 项</span>
        </div>
        <div v-if="missingNodes.length === 0" class="empty-inline">没有发现缺失链接。</div>
        <ul v-else class="missing-list">
          <li v-for="node in missingNodes" :key="node.id">
            <strong>{{ node.name }}</strong>
            <span>{{ node.relativePath }}</span>
          </li>
        </ul>
      </section>

      <section class="graph-section">
        <div class="section-header">
          <h4>连接关系</h4>
          <span>{{ graphStore.linkCount }} 条</span>
        </div>
        <div v-if="linkItems.length === 0" class="empty-inline">暂无文档连接。</div>
        <ul v-else class="link-list">
          <li v-for="link in linkItems" :key="link.key">
            <button :title="link.sourcePath" @click="openDocument(link.sourcePath)">{{ link.sourceName }}</button>
            <span>→</span>
            <button v-if="link.targetPath" :title="link.targetPath" @click="openDocument(link.targetPath)">
              {{ link.targetName }}
            </button>
            <strong v-else>{{ link.targetName }}</strong>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useKnowledgeGraphStore } from '../store/modal/knowledgeGraph';

const graphStore = useKnowledgeGraphStore();

const nodesById = computed(() => new Map((graphStore.graphData?.nodes || []).map((node) => [node.id, node])));

const missingNodes = computed(() =>
  (graphStore.graphData?.nodes || [])
    .filter((node) => !node.exists)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
);

const indexedTimeText = computed(() => {
  if (!graphStore.lastIndexedAt) return '尚未完成索引';
  return `最近索引：${new Date(graphStore.lastIndexedAt).toLocaleString()}`;
});

const linkItems = computed(() =>
  (graphStore.graphData?.links || []).slice(0, 80).map((link) => {
    const source = nodesById.value.get(link.source);
    const target = nodesById.value.get(link.target);
    return {
      key: `${link.source}-${link.target}-${link.raw}`,
      sourceName: source?.name || link.source,
      sourcePath: source?.path || '',
      targetName: target?.name || link.target,
      targetPath: target?.exists ? target.path || '' : '',
    };
  }),
);

const refreshGraph = async (): Promise<void> => {
  await graphStore.refresh();
};

const openDocument = (path: string): void => {
  if (!path) return;
  window.dispatchEvent(new CustomEvent('open-dashboard-link', { detail: { path } }));
};

defineExpose({
  refreshGraph,
});
</script>

<style scoped>
.knowledge-graph-panel {
  height: 100%;
  padding: 14px;
  box-sizing: border-box;
  overflow: auto;
  background: #ffffff;
}

.empty-state {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.empty-state.error {
  color: #dc2626;
}

.graph-card,
.graph-section {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  padding: 12px;
}

.graph-section {
  margin-top: 12px;
}

.graph-heading,
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.graph-label,
.indexed-time,
.section-header span,
.empty-inline {
  color: #6b7280;
  font-size: 12px;
}

.graph-heading h4,
.section-header h4 {
  margin: 2px 0 0;
  color: #111827;
  font-size: 14px;
}

.graph-heading button {
  border: 1px solid #d8dee9;
  border-radius: 8px;
  background: #f3f6fb;
  color: #1f2937;
  cursor: pointer;
  font-size: 12px;
  padding: 6px 10px;
}

.graph-heading button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.indexed-time {
  margin-top: 8px;
}

.graph-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 12px;
}

.summary-item {
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.summary-value {
  display: block;
  color: #111827;
  font-size: 20px;
  font-weight: 600;
}

.summary-label {
  color: #6b7280;
  font-size: 12px;
}

.missing-list,
.link-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.missing-list li,
.link-list li {
  border-bottom: 1px solid #edf0f5;
  padding: 8px 0;
}

.missing-list strong,
.missing-list span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.missing-list strong {
  color: #991b1b;
  font-size: 12px;
}

.missing-list span {
  color: #6b7280;
  font-size: 11px;
}

.link-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: #6b7280;
  font-size: 12px;
}

.link-list button,
.link-list strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-list button {
  border: none;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
}

.link-list strong {
  color: #991b1b;
  font-weight: 500;
}
</style>
