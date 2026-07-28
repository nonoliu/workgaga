<template>
  <div v-if="todo" class="modal-overlay" @click="$emit('cancel')">
    <div class="legacy-modal" @click.stop>
      <div class="legacy-modal__header">
        <div>
          <p class="legacy-modal__kicker">LEGACY HANDOFF</p>
          <h3>处理历史遗留</h3>
        </div>
        <button class="icon-btn" @click="$emit('cancel')">×</button>
      </div>

      <div class="legacy-modal__body">
        <div class="legacy-summary">
          <strong>{{ todo.content }}</strong>
          <span>原计划 {{ todo.plannedDate }}</span>
        </div>

        <div class="legacy-grid">
          <label class="form-group">
            <span>处理方式</span>
            <select v-model="carryoverKind" class="select-input">
              <option value="active_reschedule">主动延期</option>
              <option value="passive_delay">被动拖延</option>
            </select>
          </label>

          <label class="form-group">
            <span>下次处理日期</span>
            <input v-model="plannedDate" class="text-input" type="date" />
          </label>
        </div>

        <label class="form-group">
          <span>原因说明</span>
          <textarea
            v-model="carryoverReason"
            class="text-input textarea"
            rows="3"
            placeholder="说明这次为什么没有按原计划完成..."
          ></textarea>
        </label>

        <label class="form-group">
          <span>阻塞因素（可选）</span>
          <textarea
            v-model="blockedReason"
            class="text-input textarea"
            rows="2"
            placeholder="记录卡住你的外部依赖、信息缺口或环境问题..."
          ></textarea>
        </label>
      </div>

      <div class="legacy-modal__footer">
        <button class="ghost-btn" @click="$emit('cancel')">取消</button>
        <button class="primary-btn" :disabled="!plannedDate || !carryoverReason.trim()" @click="submit">
          保存并重排
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { TodoCarryoverKind, TodoItem } from '../../store/modal/dashboard';

export interface LegacyReschedulePayload {
  plannedDate: string;
  carryoverKind: TodoCarryoverKind;
  carryoverReason?: string;
  blockedReason?: string;
}

const props = defineProps<{
  todo: TodoItem | null;
  defaultDate: string;
}>();

const emit = defineEmits<{
  cancel: [];
  submit: [payload: LegacyReschedulePayload];
}>();

const plannedDate = ref('');
const carryoverKind = ref<TodoCarryoverKind>('active_reschedule');
const carryoverReason = ref('');
const blockedReason = ref('');

watch(
  () => props.todo,
  (todo) => {
    plannedDate.value = props.defaultDate;
    carryoverKind.value = todo?.carryoverKind || 'active_reschedule';
    carryoverReason.value = todo?.carryoverReason || '';
    blockedReason.value = todo?.blockedReason || '';
  },
  { immediate: true },
);

function submit() {
  emit('submit', {
    plannedDate: plannedDate.value,
    carryoverKind: carryoverKind.value,
    carryoverReason: carryoverReason.value.trim() || undefined,
    blockedReason: blockedReason.value.trim() || undefined,
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
}

.legacy-modal {
  width: 520px;
  max-width: 92%;
  background: #ffffff;
  border: 1px solid #dfe3ea;
  border-radius: 20px;
  box-shadow: 0 16px 48px rgba(31, 36, 48, 0.12);
  overflow: hidden;
}

.legacy-modal__header,
.legacy-modal__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
}

.legacy-modal__header {
  border-bottom: 1px solid #e5e9f0;
}

.legacy-modal__kicker {
  margin: 0 0 4px;
  color: #f59e0b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.8px;
}

.legacy-modal__header h3 {
  margin: 0;
  color: #1f2430;
  font-size: 18px;
}

.legacy-modal__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
}

.legacy-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  background: #fff8e6;
  border-left: 3px solid #f59e0b;
  border-radius: 8px;
}

.legacy-summary strong {
  color: #1f2430;
}

.legacy-summary span {
  color: #7a8294;
  font-size: 12px;
}

.legacy-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group span {
  color: #7a8294;
  font-size: 13px;
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
  min-height: 72px;
  line-height: 1.5;
  font-family: inherit;
}

.legacy-modal__footer {
  gap: 12px;
  justify-content: flex-end;
  border-top: 1px solid #e5e9f0;
  background: #f8fafc;
}

.primary-btn,
.ghost-btn,
.icon-btn {
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.primary-btn {
  min-height: 36px;
  padding: 0 14px;
  background: #2d6cdf;
  color: #ffffff;
}

.primary-btn:disabled {
  background: #aeb8c8;
  cursor: not-allowed;
}

.ghost-btn {
  min-height: 36px;
  padding: 0 14px;
  background: #eef1f7;
  color: #1f2430;
  border: 1px solid #dfe3ea;
}

.icon-btn {
  width: 28px;
  height: 28px;
  background: #f3f5f9;
  color: #5f6b7a;
}

@media (max-width: 760px) {
  .legacy-grid {
    grid-template-columns: 1fr;
  }
}
</style>
