<template>
  <main class="knowledge-graph-workspace">
    <header class="workspace-header">
      <div>
        <div class="eyebrow">KNOWLEDGE WORKSPACE</div>
        <h1>知识图谱</h1>
        <p>
          {{ selectedVaultPaths.length }} /
          {{ graphStore.vaults.length }} 个知识库 ·
          {{ selectedNoteCount }} 个文档 · {{ selectedLinkCount }} 条关系
        </p>
        <div
          v-if="graphStore.vaults.length"
          class="vault-selector"
          aria-label="选择知识库"
        >
          <label
            v-for="vault in graphStore.vaults"
            :key="vault.path"
            class="vault-option"
          >
            <input
              type="checkbox"
              :checked="selectedVaultPaths.includes(vault.path)"
              @change="toggleVault(vault.path)"
            />
            <span>{{ vault.name }}</span>
          </label>
        </div>
      </div>
      <div class="workspace-actions">
        <span class="index-state" :class="{ loading: graphStore.loading }">
          {{ graphStore.loading ? "正在索引" : "索引已完成" }}
        </span>
        <button
          class="secondary-button"
          :disabled="graphStore.loading"
          @click="refreshGraph"
        >
          {{ graphStore.loading ? "索引中…" : "刷新图谱" }}
        </button>
        <button class="primary-button" @click="openExplorer">返回知识库</button>
      </div>
    </header>

    <section class="workspace-content">
      <div class="graph-main-column">
        <KnowledgeGraphPanel
          :graph-data="selectedGraphData"
          :show-secondary-lists="false"
          @node-selected="handleNodeSelected"
        />
      </div>
      <aside class="node-details" :class="{ empty: !selectedNode }">
        <template v-if="selectedNode">
          <div class="details-eyebrow">当前节点</div>
          <h2>{{ selectedNode.name }}</h2>
          <div class="details-type">{{ nodeTypeLabel }}</div>
          <p v-if="selectedNode.relativePath" class="details-path">
            {{ selectedNode.relativePath }}
          </p>
          <div class="details-stats">
            <span>入链 {{ incomingLinks.length }}</span>
            <span>出链 {{ outgoingLinks.length }}</span>
          </div>
          <button
            v-if="selectedNode.path"
            class="open-document"
            @click="openSelectedDocument"
          >
            打开文档
          </button>
          <section class="details-section">
            <h3>反向链接</h3>
            <button
              v-for="link in incomingLinks"
              :key="`${link.source}-${link.raw}`"
              class="related-item"
              @click="handleNodeSelected(link.source)"
            >
              {{ nodeById.get(link.source)?.name || link.source }}
            </button>
            <span v-if="incomingLinks.length === 0" class="details-empty"
              >暂无反向链接</span
            >
          </section>
        </template>
        <div v-else class="details-placeholder">
          <strong>节点详情</strong>
          <span>点击图谱节点查看路径、关系和打开入口</span>
        </div>
      </aside>
    </section>

    <section class="bottom-panel secondary-panel">
      <div class="secondary-panel-title">连接关系与缺失连接</div>
      <nav class="bottom-tabs" aria-label="图谱辅助信息">
        <button
          :class="{ active: bottomTab === 'missing' }"
          @click="bottomTab = 'missing'"
        >
          缺失链接 {{ missingNodes.length }}
        </button>
        <button
          :class="{ active: bottomTab === 'backlinks' }"
          @click="bottomTab = 'backlinks'"
        >
          反向链接
        </button>
        <button
          :class="{ active: bottomTab === 'notes' }"
          @click="bottomTab = 'notes'"
        >
          文档列表
        </button>
        <button
          :class="{ active: bottomTab === 'logs' }"
          @click="bottomTab = 'logs'"
        >
          索引日志
        </button>
      </nav>
      <div class="bottom-content">
        <template v-if="bottomTab === 'missing'">
          <span v-if="missingNodes.length === 0" class="bottom-empty"
            >暂无缺失链接</span
          >
          <button
            v-for="node in missingNodes.slice(0, 12)"
            :key="node.id"
            class="bottom-item"
            @click="handleNodeSelected(node.id)"
          >
            {{ node.name }}
          </button>
        </template>
        <template v-else-if="bottomTab === 'backlinks'">
          <span v-if="incomingLinks.length === 0" class="bottom-empty"
            >请选择节点查看反向链接</span
          >
          <button
            v-for="link in incomingLinks.slice(0, 12)"
            :key="`${link.source}-${link.raw}`"
            class="bottom-item"
            @click="handleNodeSelected(link.source)"
          >
            {{ nodeById.get(link.source)?.name || link.source }}
          </button>
        </template>
        <template v-else-if="bottomTab === 'notes'">
          <button
            v-for="note in noteList.slice(0, 12)"
            :key="note.id"
            class="bottom-item"
            @click="handleNodeSelected(note.id)"
          >
            {{ note.title }}
          </button>
        </template>
        <template v-else>
          <span class="bottom-empty">最近索引：{{ indexedTimeText }}</span>
          <span v-if="graphStore.graphData?.indexStats" class="bottom-empty">
            {{
              graphStore.graphData.indexStats.mode === "incremental"
                ? "增量"
                : "全量"
            }}索引，耗时
            {{ graphStore.graphData.indexStats.durationMs }}ms，失败
            {{ graphStore.graphData.indexStats.failedFiles }} 项
          </span>
        </template>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import KnowledgeGraphPanel from "./KnowledgeGraphPanel.vue";
import { useKnowledgeGraphStore } from "../store";
import type {
  KnowledgeGraphData,
  KnowledgeGraphLink,
  KnowledgeGraphNode,
  KnowledgeNote,
} from "./types";

const graphStore = useKnowledgeGraphStore();
const selectedVaultPaths = ref<string[]>(
  graphStore.vaults.map((vault) => vault.path),
);

const toggleVault = (path: string): void => {
  selectedVaultPaths.value = selectedVaultPaths.value.includes(path)
    ? selectedVaultPaths.value.filter((item) => item !== path)
    : [...selectedVaultPaths.value, path];
  selectedNodeId.value = null;
};
const selectedGraphs = computed(() =>
  Object.entries(graphStore.graphByVault).filter(([vaultPath]) =>
    selectedVaultPaths.value.includes(vaultPath),
  ),
);
const selectedGraphData = computed(() => {
  if (Object.keys(graphStore.graphByVault).length === 0) {
    return graphStore.graphData;
  }
  const nodes = selectedGraphs.value.reduce(
    (all, [, graph]) => all.concat(graph.nodes),
    [] as NonNullable<KnowledgeGraphData["nodes"]>,
  );
  const links = selectedGraphs.value.reduce(
    (all, [, graph]) => all.concat(graph.links),
    [] as NonNullable<KnowledgeGraphData["links"]>,
  );
  const notes = selectedGraphs.value.reduce(
    (all, [, graph]) => all.concat(graph.notes || []),
    [] as KnowledgeNote[],
  );
  return graphStore.graphData
    ? { ...graphStore.graphData, nodes, links, notes }
    : null;
});
const selectedNoteCount = computed(
  () =>
    selectedGraphData.value?.nodes.filter((node) => node.exists).length || 0,
);
const selectedLinkCount = computed(
  () => selectedGraphData.value?.links.length || 0,
);

watch(
  () => graphStore.vaults.map((vault) => vault.path),
  (paths) => {
    const available = new Set(paths);
    selectedVaultPaths.value = selectedVaultPaths.value.filter((path) =>
      available.has(path),
    );
    paths.forEach((path) => {
      if (!selectedVaultPaths.value.includes(path)) {
        selectedVaultPaths.value.push(path);
      }
    });
  },
  { deep: true },
);

const bottomTab = ref<"missing" | "backlinks" | "notes" | "logs">("missing");
const selectedNodeId = ref<string | null>(null);
const nodeById = computed(
  () =>
    new Map((graphStore.graphData?.nodes || []).map((node) => [node.id, node])),
);
const selectedNode = computed<KnowledgeGraphNode | null>(() =>
  selectedNodeId.value
    ? nodeById.value.get(selectedNodeId.value) || null
    : null,
);
const incomingLinks = computed<KnowledgeGraphLink[]>(() =>
  selectedNodeId.value
    ? (graphStore.graphData?.links || []).filter(
        (link) => link.target === selectedNodeId.value,
      )
    : [],
);
const outgoingLinks = computed<KnowledgeGraphLink[]>(() =>
  selectedNodeId.value
    ? (graphStore.graphData?.links || []).filter(
        (link) => link.source === selectedNodeId.value,
      )
    : [],
);
const missingNodes = computed(() =>
  (graphStore.graphData?.nodes || []).filter(
    (node) => node.category === "missing",
  ),
);
const noteList = computed(() => graphStore.graphData?.notes || []);
const indexedTimeText = computed(() => {
  const indexedAt = graphStore.graphData?.indexedAt;
  return indexedAt ? new Date(indexedAt).toLocaleString() : "尚未索引";
});

const nodeTypeLabel = computed(() => {
  const labels = {
    note: "文档",
    heading: "标题",
    tag: "标签",
    missing: "缺失节点",
  };
  return selectedNode.value
    ? labels[selectedNode.value.category || "note"]
    : "";
});

const handleNodeSelected = (nodeId: string): void => {
  selectedNodeId.value = nodeId;
};

const openSelectedDocument = (): void => {
  const path = selectedNode.value?.path;
  if (!path) return;
  window.dispatchEvent(
    new CustomEvent("open-file-from-sidebar", { detail: { path } }),
  );
};

const refreshGraph = (): void => {
  void graphStore.refresh();
};

const openExplorer = (): void => {
  window.dispatchEvent(
    new CustomEvent("switch-main-view", { detail: { view: "dashboard" } }),
  );
  window.dispatchEvent(new CustomEvent("knowledge-graph-open-explorer"));
};
</script>

<style scoped>
.knowledge-graph-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background: #f7f9fc;
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 88px;
  padding: 20px 28px;
  border-bottom: 1px solid #e1e7f0;
  background: #fff;
}

.vault-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.vault-option {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  font-size: 11px;
  padding: 5px 9px;
}

.vault-option:has(input:checked) {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
}

.vault-option input {
  margin: 0;
}

.eyebrow {
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

h1 {
  margin: 4px 0 3px;
  color: #172033;
  font-size: 24px;
  line-height: 1.2;
}

p {
  margin: 0;
  color: #718096;
  font-size: 13px;
}

.workspace-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.index-state {
  color: #15803d;
  font-size: 12px;
}

.index-state.loading {
  color: #b45309;
}

button {
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  padding: 8px 12px;
}

.secondary-button {
  border: 1px solid #d8e0eb;
  background: #fff;
  color: #334155;
}

.primary-button {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.workspace-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  align-items: start;
  gap: 18px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 28px 28px;
}

.graph-main-column {
  min-width: 0;
  min-height: 0;
}

.workspace-content :deep(.knowledge-graph-panel) {
  max-width: 1240px;
  margin: 0 auto;
}

.node-details {
  align-self: start;
  min-height: 260px;
  padding: 18px;
  border: 1px solid #e1e7f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 24px rgb(30 64 175 / 5%);
}

.node-details.empty {
  color: #64748b;
}

.details-eyebrow {
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.node-details h2 {
  margin: 8px 0 6px;
  color: #172033;
  font-size: 18px;
  overflow-wrap: anywhere;
}

.details-type {
  display: inline-block;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  padding: 4px 8px;
}

.details-path {
  color: #64748b;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.details-stats {
  display: flex;
  gap: 12px;
  margin: 14px 0;
  color: #475569;
  font-size: 12px;
}

.open-document {
  width: 100%;
  border: 1px solid #2563eb;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  padding: 8px;
}

.details-section {
  margin-top: 20px;
  border-top: 1px solid #eef2f7;
  padding-top: 14px;
}

.details-section h3 {
  margin: 0 0 8px;
  color: #334155;
  font-size: 13px;
}

.related-item {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  font-size: 12px;
  padding: 7px 0;
  text-align: left;
}

.details-empty,
.details-placeholder {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.6;
}

.details-placeholder {
  padding-top: 48px;
  text-align: center;
}

.details-placeholder strong {
  color: #475569;
  font-size: 14px;
}

.bottom-panel {
  flex-shrink: 0;
  margin: 0 28px 20px;
  border: 1px solid #e1e7f0;
  border-radius: 12px;
  background: #fff;
}

.secondary-panel-title {
  padding: 12px 14px 0;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.bottom-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #eef2f7;
  padding: 8px 10px 0;
}

.bottom-tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: #64748b;
  padding: 8px 10px;
}

.bottom-tabs button.active {
  border-bottom-color: #2563eb;
  color: #2563eb;
}

.bottom-content {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding: 10px 12px;
}

.bottom-item {
  flex: 0 0 auto;
  border: 1px solid #e1e7f0;
  background: #f8fafc;
  color: #334155;
  font-size: 11px;
  padding: 6px 9px;
}

.bottom-empty {
  color: #94a3b8;
  font-size: 12px;
}

@media (max-width: 900px) {
  .workspace-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .workspace-content {
    display: flex;
    flex-direction: column;
    padding: 12px 16px 16px;
  }

  .bottom-panel {
    margin: 0 16px 16px;
  }

  .node-details {
    width: auto;
  }

  .workspace-actions {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
