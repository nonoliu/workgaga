<template>
  <section class="focus-zone" :class="{ idle: !todo }">
    <div class="focus-zone__header">
      <div>
        <p class="focus-zone__kicker">FOCUS ZONE</p>
        <h3>{{ todo ? '当前专注任务' : '专注舱待激活' }}</h3>
      </div>
      <span class="focus-zone__timer">{{ todo ? formatMinutes(elapsedMinutes) : '00:00' }}</span>
    </div>

    <div v-if="todo" class="focus-zone__body">
      <div class="focus-zone__title-row">
        <strong>{{ todo.content }}</strong>
        <span class="focus-zone__priority" :class="`priority-${todo.priority || 'medium'}`">
          {{ priorityLabel(todo.priority) }}
        </span>
      </div>

      <div class="focus-zone__meta">
        <span>计划日期 {{ todo.plannedDate }}</span>
        <span v-if="todo.estimatedMinutes">预估 {{ todo.estimatedMinutes }} 分钟</span>
        <span v-if="todo.actualMinutes">累计记录 {{ todo.actualMinutes }} 分钟</span>
      </div>

      <div class="focus-zone__actions">
        <button class="ghost-btn" @click="$emit('pause', todo.id)">暂停专注</button>
        <button class="primary-btn" @click="$emit('complete', todo.id)">完成并复盘</button>
      </div>
    </div>

    <div v-else class="focus-zone__empty">
      <p>从“今日计划池”选择一项最重要的任务进入专注，工作台会帮你把注意力收拢到一件事上。</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { TodoItem } from '../../store/modal/dashboard';

defineProps<{
  todo: TodoItem | null;
  elapsedMinutes: number;
}>();

defineEmits<{
  pause: [id: string];
  complete: [id: string];
}>();

function priorityLabel(priority?: TodoItem['priority']) {
  if (priority === 'high') return '高优先级';
  if (priority === 'low') return '低优先级';
  return '中优先级';
}

function formatMinutes(value: number) {
  const safeValue = Math.max(0, Math.floor(value));
  const hours = Math.floor(safeValue / 60);
  const minutes = safeValue % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
</script>

<style scoped>
.focus-zone {
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid rgba(45, 108, 223, 0.16);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(45, 108, 223, 0.08), rgba(111, 91, 215, 0.06)), #ffffff;
}

.focus-zone.idle {
  background: #f8fafc;
  border-style: dashed;
}

.focus-zone__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.focus-zone__kicker {
  margin: 0 0 4px;
  color: #2d6cdf;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.8px;
}

.focus-zone__header h3 {
  margin: 0;
  font-size: 18px;
  color: #1f2430;
}

.focus-zone__timer {
  min-width: 72px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #eef5ff;
  color: #2d6cdf;
  font-weight: 700;
  text-align: center;
}

.focus-zone__body,
.focus-zone__empty {
  margin-top: 14px;
}

.focus-zone__title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.focus-zone__title-row strong {
  color: #1f2430;
  font-size: 16px;
  line-height: 1.5;
}

.focus-zone__priority {
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid transparent;
}

.focus-zone__priority.priority-high {
  background: #fff0f2;
  border-color: #ffd5dc;
  color: #c2415d;
}

.focus-zone__priority.priority-medium {
  background: #fff8e6;
  border-color: #fde7a9;
  color: #b45309;
}

.focus-zone__priority.priority-low {
  background: #eef5ff;
  border-color: #cfe0ff;
  color: #2d6cdf;
}

.focus-zone__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  color: #7a8294;
  font-size: 12px;
}

.focus-zone__actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.focus-zone__empty p {
  margin: 0;
  color: #7a8294;
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .focus-zone__header,
  .focus-zone__title-row,
  .focus-zone__actions {
    flex-direction: column;
  }
}
</style>
