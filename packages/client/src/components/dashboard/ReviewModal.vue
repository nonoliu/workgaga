<template>
  <div v-if="todo" class="modal-overlay" @click="$emit('cancel')">
    <div class="glass-modal completion-modal" @click.stop>
      <div class="modal-header">
        <h3>完成待办</h3>
        <button class="icon-btn" @click="$emit('cancel')">×</button>
      </div>
      <div class="modal-body">
        <div class="todo-summary-box">
          <strong>{{ todo.content }}</strong>
          <span v-if="todo.estimatedMinutes" class="summary-hint"> 预估 {{ todo.estimatedMinutes }} 分钟 </span>
        </div>

        <div class="review-grid">
          <div class="form-group">
            <label>实际耗时（分钟）</label>
            <input v-model="actualMinutes" class="text-input" type="number" min="1" step="5" placeholder="例如 45" />
          </div>
          <div class="form-group">
            <label>执行感受</label>
            <select v-model="completionFeeling" class="select-input">
              <option value="smooth">顺畅推进</option>
              <option value="blocked">中途卡壳</option>
              <option value="tiring">较为耗能</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>复盘记录（可选）</label>
          <textarea
            v-model="completionNote"
            class="text-input textarea"
            placeholder="记录结果、偏差原因、下次要怎么做得更顺..."
            rows="3"
          ></textarea>
        </div>

        <div class="form-group">
          <label>衍生后续待办（可选）</label>
          <div class="derived-todo-input">
            <input
              v-model="newDerivedTodoContent"
              class="text-input"
              placeholder="输入后续待办内容..."
              @keyup.enter="addTempDerivedTodo"
            />
            <select v-model="newDerivedTodoPriority" class="select-input compact-select">
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
            <button class="ghost-btn" @click="addTempDerivedTodo">添加</button>
          </div>
          <ul v-if="tempDerivedTodos.length" class="temp-derived-list">
            <li v-for="(dt, index) in tempDerivedTodos" :key="`${dt.content}-${index}`" class="temp-derived-item">
              <span class="temp-priority" :class="`priority-${dt.priority}`">{{ priorityLabel(dt.priority) }}</span>
              <span class="dt-content">{{ dt.content }}</span>
              <button class="icon-btn tiny-btn" @click="removeTempDerivedTodo(index)">×</button>
            </li>
          </ul>
        </div>

        <div class="form-group">
          <label>补充关联文档（可选）</label>
          <div class="linked-docs">
            <button v-for="doc in tempLinkedDocs" :key="doc.path" class="doc-chip" @click="$emit('open-doc', doc.path)">
              {{ doc.name }}
              <span @click.stop="removeTempLinkedDoc(doc.path)">×</span>
            </button>
          </div>
          <div class="doc-actions">
            <button class="ghost-btn doc-btn" @click="linkCurrentDocumentToCompletion">关联当前文档</button>
            <button class="ghost-btn doc-btn" @click="selectAndLinkDocumentToCompletion">选择文档</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="ghost-btn" @click="$emit('cancel')">取消</button>
        <button class="primary-btn" @click="submit">确认完成</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, ref } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { notifyError } from '../../utils/notifications';
import type { LinkedDocument, TodoFeeling, TodoItem } from '../../store/modal/dashboard';

export interface ReviewModalSubmitPayload {
  note?: string;
  actualMinutes?: number;
  processFeeling: TodoFeeling;
  linkedDocs: LinkedDocument[];
  derivedTodos: Array<{ content: string; priority: TodoItem['priority'] }>;
}

const props = defineProps<{
  todo: TodoItem | null;
  currentFilePath?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  'open-doc': [path: string];
  submit: [payload: ReviewModalSubmitPayload];
}>();

const completionNote = ref('');
const actualMinutes = ref('');
const completionFeeling = ref<TodoFeeling>('smooth');
const tempLinkedDocs = ref<LinkedDocument[]>([]);
const tempDerivedTodos = ref<Array<{ content: string; priority: TodoItem['priority'] }>>([]);
const newDerivedTodoContent = ref('');
const newDerivedTodoPriority = ref<TodoItem['priority']>('medium');

watch(
  () => props.todo,
  (todo) => {
    completionNote.value = todo?.reviewNote || todo?.completionNote || '';
    actualMinutes.value = String(todo?.actualMinutes ?? deriveSuggestedActualMinutes(todo) ?? '');
    completionFeeling.value = todo?.processFeeling || 'smooth';
    tempLinkedDocs.value = [];
    tempDerivedTodos.value = [];
    newDerivedTodoContent.value = '';
    newDerivedTodoPriority.value = 'medium';
  },
  { immediate: true },
);

function parseMinutesInput(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

function deriveSuggestedActualMinutes(todo: TodoItem | null) {
  if (!todo) return undefined;
  if (todo.focusStartedAt) {
    return Math.max(1, Math.floor((Date.now() - todo.focusStartedAt) / (60 * 1000)));
  }
  return todo.estimatedMinutes;
}

function extractFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function priorityLabel(priority?: TodoItem['priority']) {
  if (priority === 'high') return '高';
  if (priority === 'low') return '低';
  return '中';
}

function addTempDerivedTodo() {
  if (!newDerivedTodoContent.value.trim()) return;
  tempDerivedTodos.value.push({
    content: newDerivedTodoContent.value.trim(),
    priority: newDerivedTodoPriority.value,
  });
  newDerivedTodoContent.value = '';
  newDerivedTodoPriority.value = 'medium';
}

function removeTempDerivedTodo(index: number) {
  tempDerivedTodos.value.splice(index, 1);
}

function removeTempLinkedDoc(path: string) {
  tempLinkedDocs.value = tempLinkedDocs.value.filter((doc) => doc.path !== path);
}

function linkCurrentDocumentToCompletion() {
  const currentPath = props.currentFilePath;
  if (!currentPath) return notifyError('当前没有打开的文档，无法关联');
  const doc = { path: currentPath, name: extractFileName(currentPath) };
  if (!tempLinkedDocs.value.some((item) => item.path === doc.path)) {
    tempLinkedDocs.value.push(doc);
  }
}

async function selectAndLinkDocumentToCompletion() {
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [{ name: 'markdown', extensions: ['md', 'markdown', 'text'] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    paths.forEach((path) => {
      const doc = { path, name: extractFileName(path) };
      if (!tempLinkedDocs.value.some((item) => item.path === doc.path)) {
        tempLinkedDocs.value.push(doc);
      }
    });
  } catch (error) {
    notifyError(`选择文件失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function submit() {
  emit('submit', {
    note: completionNote.value.trim() || undefined,
    actualMinutes: parseMinutesInput(actualMinutes.value),
    processFeeling: completionFeeling.value,
    linkedDocs: tempLinkedDocs.value,
    derivedTodos: tempDerivedTodos.value,
  });
}
</script>

<style scoped>
.modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

.glass-modal {
  width: 480px;
  max-width: 90%;
  background: #ffffff;
  border: 1px solid #dfe3ea;
  border-radius: 24px;
  box-shadow: 0 16px 48px rgba(31, 36, 48, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e9f0;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #1f2430;
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.todo-summary-box {
  padding: 14px 18px;
  background: #f4f6fb;
  border-left: 3px solid #28a745;
  border-radius: 8px;
  color: #1f2430;
  font-size: 15px;
}

.summary-hint {
  display: inline-block;
  margin-top: 6px;
  color: #7a8294;
  font-size: 12px;
}

.review-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-group label {
  font-size: 13px;
  color: #7a8294;
  font-weight: 700;
}

.text-input,
.select-input {
  border: 1px solid #dfe3ea;
  background: #ffffff;
  color: #1f2430;
  border-radius: 8px;
  padding: 10px 12px;
  outline: none;
}

.textarea {
  resize: vertical;
  min-height: 80px;
  padding: 12px;
  font-family: inherit;
  line-height: 1.5;
}

.linked-docs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.doc-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #d8d8f2;
  border-radius: 999px;
  background: #f2f2ff;
  color: #4f46a5;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.doc-chip span {
  color: #6f5bd7;
}

.doc-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.doc-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  min-height: 32px;
}

.derived-todo-input {
  display: flex;
  gap: 8px;
}

.compact-select {
  min-width: 60px;
  padding: 8px;
}

.temp-derived-list {
  list-style: none;
  padding: 0;
  margin: 4px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.temp-derived-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #f4f6fb;
  border-radius: 8px;
  font-size: 13px;
}

.temp-priority {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 11px;
}

.temp-priority.priority-high {
  background: #fff0f2;
  color: #dc3545;
}

.temp-priority.priority-medium {
  background: #fff4e0;
  color: #b45309;
}

.temp-priority.priority-low {
  background: #eef5ff;
  color: #2d6cdf;
}

.dt-content {
  flex: 1;
  color: #1f2430;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: #f3f5f9;
  color: #5f6b7a;
  cursor: pointer;
}

.tiny-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 14px;
  padding: 0;
  line-height: 1;
}

.primary-btn,
.ghost-btn {
  min-height: 36px;
  border: none;
  border-radius: 8px;
  padding: 0 14px;
  cursor: pointer;
}

.primary-btn {
  background: #2d6cdf;
  color: #ffffff;
}

.ghost-btn {
  border: 1px solid #dfe3ea;
  background: #eef1f7;
  color: #1f2430;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e5e9f0;
  background: #f8fafc;
}

@media (max-width: 760px) {
  .review-grid,
  .derived-todo-input,
  .doc-actions {
    grid-template-columns: 1fr;
    flex-direction: column;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
