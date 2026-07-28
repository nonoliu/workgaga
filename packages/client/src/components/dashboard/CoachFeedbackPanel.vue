<template>
  <section class="coach-panel">
    <div class="coach-panel__header">
      <div>
        <p class="coach-panel__kicker">COACH FEEDBACK</p>
        <h3>方法反馈</h3>
      </div>
      <span class="coach-panel__badge">{{ cards.length }} 条</span>
    </div>

    <div class="coach-panel__list">
      <article v-for="card in cards" :key="card.id" class="coach-card" :class="`level-${card.level}`">
        <div class="coach-card__head">
          <strong>{{ card.title }}</strong>
          <span class="coach-card__level">{{ levelLabel(card.level) }}</span>
        </div>
        <p class="coach-card__judgement">{{ card.judgement }}</p>
        <dl class="coach-card__detail">
          <div>
            <dt>现象证据</dt>
            <dd>{{ card.evidence }}</dd>
          </div>
          <div>
            <dt>本质问题</dt>
            <dd>{{ card.essence }}</dd>
          </div>
          <div>
            <dt>下一步建议</dt>
            <dd>{{ card.action }}</dd>
          </div>
          <div>
            <dt>做事方法建议</dt>
            <dd>{{ card.method }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
export interface CoachFeedbackCard {
  id: string;
  title: string;
  level: 'attention' | 'positive' | 'warning';
  judgement: string;
  evidence: string;
  essence: string;
  action: string;
  method: string;
}

defineProps<{
  cards: CoachFeedbackCard[];
}>();

function levelLabel(level: CoachFeedbackCard['level']) {
  if (level === 'positive') return '正向';
  if (level === 'warning') return '提醒';
  return '关注';
}
</script>

<style scoped>
.coach-panel {
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid #e5e9f0;
  border-radius: 14px;
  background: #ffffff;
}

.coach-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.coach-panel__kicker {
  margin: 0 0 4px;
  color: #6f5bd7;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.8px;
}

.coach-panel__header h3 {
  margin: 0;
  font-size: 18px;
  color: #1f2430;
}

.coach-panel__badge {
  padding: 6px 10px;
  border-radius: 999px;
  background: #f4f0ff;
  color: #6f5bd7;
  font-size: 12px;
  font-weight: 700;
}

.coach-panel__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.coach-card {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid #e5e9f0;
  background: #f8fafc;
}

.coach-card.level-positive {
  border-color: #cdebd6;
  background: #f3fbf6;
}

.coach-card.level-warning {
  border-color: #fde7a9;
  background: #fffbf1;
}

.coach-card.level-attention {
  border-color: #d9e5ff;
  background: #f7faff;
}

.coach-card__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.coach-card__head strong {
  color: #1f2430;
  font-size: 14px;
}

.coach-card__level {
  flex: 0 0 auto;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(31, 36, 48, 0.06);
  color: #5f6b7a;
  font-size: 11px;
}

.coach-card__judgement {
  margin: 10px 0 0;
  color: #1f2430;
  font-size: 13px;
  line-height: 1.6;
}

.coach-card__detail {
  margin: 12px 0 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.coach-card__detail div {
  display: grid;
  gap: 2px;
}

.coach-card__detail dt {
  color: #7a8294;
  font-size: 11px;
  font-weight: 700;
}

.coach-card__detail dd {
  margin: 0;
  color: #1f2430;
  font-size: 12px;
  line-height: 1.6;
}
</style>
