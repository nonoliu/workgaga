<template>
  <div class="ai-panel">
    <section class="hero-card">
      <div>
        <div class="eyebrow">万能 AI</div>
        <h4>先理解你要推进的事情，再决定是否需要文档、知识库、待办或日程。</h4>
      </div>
      <span class="api-pill">OpenAI 未配置</span>
    </section>

    <nav class="tab-bar">
      <button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
        {{ tab.label }}
      </button>
    </nav>

    <section v-if="activeTab === 'chat'" class="tab-content">
      <div class="context-card">
        <div class="section-title">当前上下文</div>
        <div class="context-row">
          <span>当前文档</span><strong>{{ currentFileName }}</strong>
        </div>
        <div class="context-row">
          <span>当前知识库</span><strong>{{ knowledgeGraphStore.vaultName || '未打开' }}</strong>
        </div>
        <div class="context-grid">
          <div>
            <strong>{{ knowledgeGraphStore.noteCount }}</strong
            ><span>文档</span>
          </div>
          <div>
            <strong>{{ knowledgeGraphStore.linkCount }}</strong
            ><span>连接</span>
          </div>
          <div>
            <strong>{{ taskCounts.running }}</strong
            ><span>进行中</span>
          </div>
        </div>
      </div>

      <div class="composer-card">
        <textarea
          v-model="userInput"
          placeholder="告诉 AI 你要推进的事情，例如：准备明天客户沟通、规划一个项目、整理一段想法、生成会议纪要..."
        />
        <div class="quick-actions">
          <button v-for="action in quickActions" :key="action" @click="userInput = action">{{ action }}</button>
        </div>
        <button class="primary-btn" :disabled="!userInput.trim()" @click="createTask">创建 AI 任务</button>
      </div>

      <article v-if="selectedTask" class="task-detail">
        <div class="detail-header">
          <div>
            <div class="section-title">行动建议</div>
            <h4>{{ selectedTask.title }}</h4>
          </div>
          <span class="status" :class="selectedTask.status">{{ statusText(selectedTask.status) }}</span>
        </div>
        <p>{{ selectedTask.progressText }}</p>
        <div class="chips">
          <span>{{ categoryText(selectedTask.category) }}</span>
          <span v-for="kind in selectedTask.outputKinds" :key="kind">{{ outputKindText(kind) }}</span>
        </div>
        <textarea v-model="selectedTask.prompt" class="prompt-preview" readonly />
        <div class="detail-actions">
          <button @click="copyText(selectedTask.prompt)">复制 Prompt</button>
          <button
            @click="
              aiStore.updateTask(selectedTask.id, {
                status: 'running',
                progressText: '任务已标记为执行中。等待外部 AI 或后续真实 API 返回结果。',
              })
            "
          >
            标记执行中
          </button>
          <button
            @click="
              aiStore.updateTask(selectedTask.id, {
                status: 'completed',
                progressText: '任务已完成，可将结果保存为文档、待办、日程或知识沉淀。',
              })
            "
          >
            标记完成
          </button>
        </div>
        <div class="result-actions">
          <button>保存为文档</button>
          <button>提取待办</button>
          <button>提取日程</button>
          <button>建议加入知识库</button>
        </div>
      </article>
    </section>

    <section v-else-if="activeTab === 'tasks'" class="tab-content">
      <div class="summary-card">
        <strong>{{ taskCounts.total }}</strong> 个任务：{{ taskCounts.running }} 进行中，{{
          taskCounts.pending
        }}
        待处理，{{ taskCounts.completed }} 已完成
      </div>
      <ul class="list">
        <li v-for="task in sortedTasks" :key="task.id" class="list-item">
          <button
            class="item-main"
            @click="
              selectedTaskId = task.id;
              activeTab = 'chat';
            "
          >
            <strong>{{ task.title }}</strong>
            <span>{{ categoryText(task.category) }} · {{ task.progressText }}</span>
          </button>
          <span class="status" :class="task.status">{{ statusText(task.status) }}</span>
          <button class="danger" @click="aiStore.deleteTask(task.id)">删除</button>
        </li>
      </ul>
    </section>

    <section v-else-if="activeTab === 'skills'" class="tab-content">
      <div class="section-title">Skill 管理</div>
      <p class="muted">Skill 是万能 AI 可调用的能力模板，不直接绑定知识库或日程；是否沉淀由 AI 根据任务判断。</p>
      <form class="inline-form" @submit.prevent="addSkill">
        <input v-model="newSkillName" placeholder="新 Skill 名称" />
        <button :disabled="!newSkillName.trim()">新增</button>
      </form>
      <ul class="list">
        <li v-for="skill in aiStore.skills" :key="skill.id" class="list-item vertical">
          <div class="item-heading">
            <strong>{{ skill.name }}</strong>
            <label
              ><input type="checkbox" :checked="skill.enabled" @change="onToggleSkill(skill.id, $event)" /> 启用</label
            >
          </div>
          <span>{{ skill.description }}</span>
          <small>{{ skill.whenToUse }}</small>
          <div class="chips">
            <span>{{ categoryText(skill.category) }}</span>
            <span v-if="skill.outputPolicy.mayCreateDocument">可产出文档</span>
            <span v-if="skill.outputPolicy.mayCreateTodo">可产出待办</span>
            <span v-if="skill.outputPolicy.mayCreateSchedule">可产生日程</span>
            <span v-if="skill.outputPolicy.mayUpdateKnowledgeBase">可建议知识沉淀</span>
          </div>
        </li>
      </ul>
    </section>

    <section v-else-if="activeTab === 'agents'" class="tab-content">
      <div class="section-title">Agent 管理</div>
      <p class="muted">Agent 是后台专业执行者，普通用户默认只面对万能 AI。复杂任务由万能 AI 判断是否调用专业 Agent。</p>
      <form class="inline-form" @submit.prevent="addAgent">
        <input v-model="newAgentName" placeholder="新 Agent 名称" />
        <button :disabled="!newAgentName.trim()">新增</button>
      </form>
      <ul class="list">
        <li v-for="agent in aiStore.agents" :key="agent.id" class="list-item vertical">
          <div class="item-heading">
            <strong>{{ agent.name }}</strong>
            <label
              ><input type="checkbox" :checked="agent.enabled" @change="onToggleAgent(agent.id, $event)" /> 启用</label
            >
          </div>
          <span>{{ agent.description }}</span>
          <small>{{ agent.whenToUse }}</small>
          <div class="chips">
            <span>{{ agent.permissionMode }}</span>
            <span>{{ agent.runMode }}</span>
            <span>调用 {{ agent.usageCount }} 次</span>
          </div>
        </li>
      </ul>
    </section>

    <section v-else class="tab-content">
      <div class="section-title">设置</div>
      <label class="setting-row"
        ><input v-model="settings.forceReadOnlyMode" type="checkbox" @change="updateSettings" />
        仅查询模式（只读，禁止写入）</label
      >
      <label class="setting-row"
        ><input v-model="settings.requireConfirmBeforeWrite" type="checkbox" @change="updateSettings" />
        写入前必须确认</label
      >
      <label class="setting-row"
        ><input v-model="settings.suggestDocuments" type="checkbox" @change="updateSettings" />
        识别到正式内容时建议保存文档</label
      >
      <label class="setting-row"
        ><input v-model="settings.suggestTodos" type="checkbox" @change="updateSettings" />
        识别行动项时建议生成待办</label
      >
      <label class="setting-row"
        ><input v-model="settings.suggestSchedules" type="checkbox" @change="updateSettings" />
        识别时间信息时建议加入日程</label
      >
      <label class="setting-row"
        ><input v-model="settings.suggestKnowledge" type="checkbox" @change="updateSettings" />
        识别长期价值时建议加入知识库</label
      >
      <div class="setting-row column">
        <span>默认输出目录</span>
        <input v-model="settings.defaultOutputDirectory" @change="updateSettings" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useAIAssistantStore, useFileStore, useKnowledgeGraphStore } from '../store';
import type { AIAgent, AICategory, AIOutputKind, AISkill, AITaskStatus } from '../store/modal/aiAssistant';

const aiStore = useAIAssistantStore();
const fileStore = useFileStore();
const knowledgeGraphStore = useKnowledgeGraphStore();

const tabs = [
  { id: 'chat', label: '对话' },
  { id: 'tasks', label: '任务' },
  { id: 'skills', label: 'Skill' },
  { id: 'agents', label: 'Agent' },
  { id: 'settings', label: '设置' },
] as const;

type TabId = (typeof tabs)[number]['id'];

const activeTab = ref<TabId>('chat');
const userInput = ref('');
const selectedTaskId = ref<string | null>(null);
const newSkillName = ref('');
const newAgentName = ref('');
const settings = reactive({ ...aiStore.settings });

const quickActions = ['帮我规划这个项目', '把这段想法整理成文档', '从会议记录提取行动项', '准备明天的沟通提纲'];
const sortedTasks = computed(() => aiStore.sortedTasks);
const taskCounts = computed(() => aiStore.taskCounts);
const selectedTask = computed(
  () => aiStore.tasks.find((task) => task.id === selectedTaskId.value) || aiStore.tasks[0] || null,
);
const currentFileName = computed(() => fileStore.currentFilePath?.split(/[\\/]/).pop() || '未打开');

const createTask = (): void => {
  const task = aiStore.createTask(userInput.value.trim());
  selectedTaskId.value = task.id;
  userInput.value = '';
};

const copyText = async (text: string): Promise<void> => {
  await navigator.clipboard?.writeText(text);
};

const toggleSkill = (id: string, enabled: boolean): void => {
  aiStore.updateSkill(id, { enabled });
};

const toggleAgent = (id: string, enabled: boolean): void => {
  aiStore.updateAgent(id, { enabled });
};

const onToggleSkill = (id: string, event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  toggleSkill(id, Boolean(target?.checked));
};

const onToggleAgent = (id: string, event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  toggleAgent(id, Boolean(target?.checked));
};

const addSkill = (): void => {
  const name = newSkillName.value.trim();
  if (!name) return;
  aiStore.addSkill({
    name,
    description: '用户自定义 Skill。',
    whenToUse: `当用户需要 ${name} 时使用。`,
    category: 'general',
    promptTemplate: `使用 ${name} 能力帮助用户完成目标。先理解任务，再判断是否需要文档、待办、日程或知识沉淀。`,
    enabled: true,
    userInvocable: true,
    outputPolicy: {
      mayCreateDocument: true,
      mayCreateTodo: true,
      mayCreateSchedule: true,
      mayUpdateKnowledgeBase: true,
    },
  } satisfies Omit<AISkill, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>);
  newSkillName.value = '';
};

const addAgent = (): void => {
  const name = newAgentName.value.trim();
  if (!name) return;
  aiStore.addAgent({
    name,
    description: '用户自定义 Agent。',
    whenToUse: `当任务适合由 ${name} 专门处理时使用。`,
    systemPrompt: `你是 ${name}。你是 workgaga 万能 AI 背后的专业执行者，必须服务于用户目标，不要把知识库或日程作为默认主线。`,
    enabled: true,
    allowedSkills: aiStore.skills.filter((skill) => skill.enabled).map((skill) => skill.id),
    allowedTools: ['read-context', 'write-document', 'manage-task', 'manage-schedule', 'use-knowledge'],
    permissionMode: 'ask',
    memoryScope: 'workspace',
    runMode: 'foreground',
  } satisfies Omit<AIAgent, 'id' | 'builtin' | 'usageCount' | 'createdAt' | 'updatedAt'>);
  newAgentName.value = '';
};

const updateSettings = (): void => {
  aiStore.updateSettings(settings);
};

const statusText = (status: AITaskStatus): string =>
  ({
    pending: '待处理',
    running: '进行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  })[status];

const categoryText = (category: AICategory): string =>
  ({
    general: '通用',
    writing: '写作',
    research: '研究',
    planning: '规划',
    organizing: '整理',
    automation: '自动化',
  })[category];

const outputKindText = (kind: AIOutputKind): string =>
  ({
    document: '可能生成文档',
    todo: '可能生成待办',
    schedule: '可能生成日程',
    knowledge: '可能沉淀知识',
  })[kind];
</script>

<style scoped>
.ai-panel {
  height: 100%;
  overflow: auto;
  padding: 14px;
  box-sizing: border-box;
  background: #ffffff;
  color: #111827;
}

.hero-card,
.context-card,
.composer-card,
.task-detail,
.summary-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  padding: 12px;
  margin-bottom: 12px;
}

.hero-card {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.eyebrow,
.section-title,
.muted,
.context-row span,
.context-grid span,
.list-item span,
.list-item small {
  color: #6b7280;
  font-size: 12px;
}

.hero-card h4,
.task-detail h4 {
  margin: 4px 0 0;
  font-size: 14px;
}

.api-pill,
.status,
.chips span {
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  padding: 4px 8px;
  font-size: 11px;
  white-space: nowrap;
}

.tab-bar {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  overflow-x: auto;
}

.tab-bar button,
.quick-actions button,
.detail-actions button,
.result-actions button,
.inline-form button,
.primary-btn,
.danger {
  border: 1px solid #d8dee9;
  border-radius: 8px;
  background: #fff;
  color: #1f2937;
  cursor: pointer;
  font-size: 12px;
  padding: 7px 10px;
}

.tab-bar button.active,
.primary-btn {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.primary-btn:disabled,
.inline-form button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.context-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}

.context-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.context-grid div {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
}

.context-grid strong,
.context-grid span {
  display: block;
}

textarea,
input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d8dee9;
  border-radius: 8px;
  padding: 9px;
  font-size: 12px;
  color: #111827;
  background: #fff;
}

textarea {
  min-height: 96px;
  resize: vertical;
}

.quick-actions,
.detail-actions,
.result-actions,
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.prompt-preview {
  min-height: 180px;
  margin-top: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.detail-header,
.item-heading {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  background: #fff;
  display: flex;
  gap: 8px;
  align-items: center;
}

.list-item.vertical {
  display: block;
}

.item-main {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.item-main strong,
.item-main span,
.list-item.vertical strong,
.list-item.vertical span,
.list-item.vertical small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status.running {
  background: #dbeafe;
  color: #1d4ed8;
}
.status.completed {
  background: #dcfce7;
  color: #166534;
}
.status.failed {
  background: #fee2e2;
  color: #991b1b;
}
.status.cancelled {
  background: #f3f4f6;
  color: #4b5563;
}

.danger {
  color: #b91c1c;
}

.inline-form {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.inline-form input {
  flex: 1;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
}

.setting-row input[type='checkbox'] {
  width: auto;
}

.setting-row.column {
  display: block;
}
</style>
