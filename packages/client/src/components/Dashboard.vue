<template>
  <div class="dashboard-container">
    <header class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">WORKGAGA CONTROL CENTER</p>
        <h1>工作台</h1>
        <p class="hero-subtitle">{{ currentDate }} · {{ dailyStatusText }}</p>
        <div class="hero-progress">
          <div class="progress-meta">
            <span>今日任务完成率</span>
            <strong>{{ todayProgress }}%</strong>
          </div>
          <div class="progress-track">
            <div
              class="progress-fill"
              :style="{ width: `${todayProgress}%` }"
            ></div>
          </div>
        </div>
      </div>
      <div class="hero-actions">
        <button class="ghost-btn" @click="goToday">回到今天</button>
        <button
          class="primary-btn hero-btn"
          @click="showHistoryPanel = !showHistoryPanel"
        >
          {{ showHistoryPanel ? "收起历史时间线" : "查看历史时间线" }}
        </button>
      </div>
    </header>

    <section
      v-if="showHistoryPanel"
      class="glass-panel history-panel history-panel-first-screen"
    >
      <div class="panel-header">
        <div>
          <p class="panel-kicker">HISTORY TIMELINE</p>
          <h2>历史待办时间线</h2>
          <p>{{ historyPanelDescription }}</p>
        </div>
        <div class="history-switch">
          <button
            class="history-switch-btn"
            :class="{ active: historyMode === 'completed' }"
            @click="historyMode = 'completed'"
          >
            完成记录 {{ historicalCompletedTodos.length }}
          </button>
          <button
            class="history-switch-btn"
            :class="{ active: historyMode === 'legacy' }"
            @click="historyMode = 'legacy'"
          >
            遗留事项 {{ historicalTodos.length }}
          </button>
        </div>
      </div>
      <div class="timeline-list">
        <div
          v-for="group in groupedHistoryTodos"
          :key="group.date"
          class="timeline-group"
        >
          <div class="timeline-date">{{ group.date }}</div>
          <ul>
            <li
              v-for="todo in group.todos"
              :key="todo.id"
              class="history-item"
              :class="{
                completed: historyMode === 'completed',
                legacy: historyMode === 'legacy',
              }"
            >
              <span
                class="timeline-dot"
                :class="{ done: historyMode === 'completed' }"
              ></span>
              <div>
                <strong>{{ todo.content }}</strong>
                <p>{{ historyTodoMeta(todo) }}</p>
                <div v-if="todo.completionNote" class="completion-note">
                  {{ todo.completionNote }}
                </div>
              </div>
              <div class="history-item-tags">
                <span
                  v-if="
                    historyMode === 'completed' && isHistoricalCatchUp(todo)
                  "
                  class="status-tag catch-up"
                  >历史补完</span
                >
                <div
                  class="priority-indicator inline"
                  :title="priorityLabel(todo.priority)"
                >
                  <component
                    :is="
                      todo.priority === 'high'
                        ? PriorityHighIcon
                        : todo.priority === 'low'
                          ? PriorityLowIcon
                          : PriorityMediumIcon
                    "
                    :size="14"
                  />
                </div>
              </div>
            </li>
          </ul>
        </div>
        <div v-if="groupedHistoryTodos.length === 0" class="empty-state">
          {{ historyEmptyText }}
        </div>
      </div>
    </section>

    <section class="overview-grid">
      <div class="overview-card card-blue">
        <span class="card-kicker">FOCUS</span>
        <span class="overview-value">{{ todayUndoneCount }}</span>
        <span class="overview-label">今日进行中</span>
        <small>保持专注，推进核心任务</small>
      </div>
      <div class="overview-card card-orange">
        <span class="card-kicker">LEGACY</span>
        <span class="overview-value">{{
          dashboardStore.historicalTodos.length
        }}</span>
        <span class="overview-label">历史遗留</span>
        <small>建议尽快清理沉积事项</small>
      </div>
      <div class="overview-card card-green">
        <span class="card-kicker">CALENDAR</span>
        <span class="overview-value">{{ currentMonthSchedules.length }}</span>
        <span class="overview-label">本月日程</span>
        <small>掌控本月节奏</small>
      </div>
      <div class="overview-card card-violet">
        <span class="card-kicker">KNOWLEDGE</span>
        <span class="overview-value">{{ knowledgeStore.noteCount }}</span>
        <span class="overview-label">知识库文档</span>
        <small>沉淀知识资产</small>
      </div>
      <div class="overview-card card-cyan">
        <span class="card-kicker">GRAPH</span>
        <span class="overview-value">{{ knowledgeStore.linkCount }}</span>
        <span class="overview-label">知识连接</span>
        <small>让信息形成网络</small>
      </div>
      <div class="overview-card card-pink">
        <span class="card-kicker">HEALTH</span>
        <span class="overview-value">{{ knowledgeStore.missingCount }}</span>
        <span class="overview-label">孤立/缺失</span>
        <small>可继续优化链接质量</small>
      </div>
    </section>

    <main class="workspace-grid">
      <section class="glass-panel task-panel">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">TASK COCKPIT</p>
            <h2>任务驾驶舱</h2>
            <p>从计划池进入专注舱，完成后即时复盘</p>
          </div>
        </div>

        <div class="quick-create neon-create">
          <input
            v-model="newTodoContent"
            class="text-input"
            placeholder="添加今日待办..."
          />
          <select v-model="newTodoScene" class="select-input scene-input">
            <option value="deep_work">深度工作</option>
            <option value="collaboration">协作沟通</option>
            <option value="admin">行政事务</option>
            <option value="learning">学习复盘</option>
          </select>
          <input
            v-model="newTodoEstimatedMinutes"
            class="text-input estimate-input"
            type="number"
            min="5"
            step="5"
            placeholder="预估分钟"
          />
          <input
            v-model="newTodoTags"
            class="text-input tags-input"
            placeholder="标签，用逗号分隔"
          />
          <select v-model="newTodoPriority" class="select-input">
            <option value="high">高优先级</option>
            <option value="medium">中优先级</option>
            <option value="low">低优先级</option>
          </select>
          <button
            class="primary-btn"
            :disabled="!newTodoContent.trim()"
            @click="handleAddTodo"
          >
            添加今日待办
          </button>
        </div>

        <FocusZone
          :todo="focusedTodo"
          :elapsed-minutes="focusedTodoElapsedMinutes"
          @pause="handlePauseFocus"
          @complete="openCompleteFromFocus"
        />

        <div class="section-block">
          <div class="section-title">
            <h3>今日计划池</h3>
            <span>{{ todayPlannedTodos.length }} 项</span>
          </div>
          <ul class="item-list">
            <TodoRow
              v-for="todo in todayPlannedTodos"
              :key="todo.id"
              :todo="todo"
              :schedules="currentMonthSchedules"
              show-focus-action
              @toggle="handleTodoToggle"
              @focus="handleTodoFocus"
              @remove="dashboardStore.removeTodo"
              @activate="dashboardStore.activateHistoricalTodo"
              @link-current="linkCurrentDocumentToTodo"
              @select-doc="selectAndLinkDocumentToTodo"
              @open-doc="openLinkedDocument"
              @unlink-doc="dashboardStore.unlinkDocumentFromTodo"
              @link-schedule="dashboardStore.linkTodoToSchedule"
              @unlink-schedule="dashboardStore.unlinkTodoFromSchedule"
            />
            <li v-if="todayPlannedTodos.length === 0" class="empty-state">
              计划池已经清空，可以从历史遗留中拉起一项，或者新增新的重点任务。
            </li>
          </ul>
        </div>

        <div class="section-block completed-block">
          <div class="section-title">
            <h3>今日已完成</h3>
            <span>{{ todayCompletedTodos.length }} 项</span>
          </div>
          <ul class="item-list">
            <TodoRow
              v-for="todo in todayCompletedTodos"
              :key="todo.id"
              :todo="todo"
              :schedules="currentMonthSchedules"
              :meta-text="todayCompletedMeta(todo)"
              :status-tag="isHistoricalCatchUp(todo) ? '历史补完' : ''"
              status-tag-class="catch-up"
              @toggle="handleTodoToggle"
              @remove="dashboardStore.removeTodo"
              @activate="dashboardStore.activateHistoricalTodo"
              @link-current="linkCurrentDocumentToTodo"
              @select-doc="selectAndLinkDocumentToTodo"
              @open-doc="openLinkedDocument"
              @unlink-doc="dashboardStore.unlinkDocumentFromTodo"
              @link-schedule="dashboardStore.linkTodoToSchedule"
              @unlink-schedule="dashboardStore.unlinkTodoFromSchedule"
            />
            <li v-if="todayCompletedTodos.length === 0" class="empty-state">
              今天完成的任务会显示在这里，包含历史补完事项。
            </li>
          </ul>
        </div>

        <div class="section-block legacy-block">
          <div class="section-title">
            <h3>历史遗留</h3>
            <span>{{ historicalTodos.length }} 项</span>
          </div>
          <ul class="item-list">
            <TodoRow
              v-for="todo in historicalTodos"
              :key="todo.id"
              :todo="todo"
              :schedules="currentMonthSchedules"
              historical
              :meta-text="historicalTodoMeta(todo)"
              :status-tag="carryoverTag(todo)"
              :status-tag-class="carryoverTagClass(todo)"
              @toggle="handleTodoToggle"
              @manage-legacy="openLegacyReschedule"
              @remove="dashboardStore.removeTodo"
              @activate="dashboardStore.activateHistoricalTodo"
              @link-current="linkCurrentDocumentToTodo"
              @select-doc="selectAndLinkDocumentToTodo"
              @open-doc="openLinkedDocument"
              @unlink-doc="dashboardStore.unlinkDocumentFromTodo"
              @link-schedule="dashboardStore.linkTodoToSchedule"
              @unlink-schedule="dashboardStore.unlinkTodoFromSchedule"
            />
            <li v-if="historicalTodos.length === 0" class="empty-state">
              没有历史遗留任务，节奏很棒。
            </li>
          </ul>
        </div>
      </section>

      <section class="glass-panel calendar-panel">
        <div class="panel-header calendar-header">
          <div>
            <p class="panel-kicker">SMART CALENDAR</p>
            <h2>智能月历</h2>
            <p>点击日期查看当天日程与待办热度</p>
          </div>
          <div class="month-switcher">
            <button class="icon-control" @click="changeMonth(-1)">‹</button>
            <strong>{{ visibleMonthTitle }}</strong>
            <button class="icon-control" @click="changeMonth(1)">›</button>
          </div>
        </div>

        <CoachFeedbackPanel :cards="coachFeedbackCards" />

        <div class="calendar-grid">
          <div v-for="day in weekLabels" :key="day" class="weekday">
            {{ day }}
          </div>
          <button
            v-for="cell in calendarCells"
            :key="cell.date"
            class="calendar-cell"
            :class="{
              outside: !cell.inCurrentMonth,
              today: cell.date === today,
              selected: cell.date === selectedDate,
              hot: cell.todoCount >= 3,
            }"
            @click="selectedDate = cell.date"
          >
            <span class="cell-day">{{ cell.day }}</span>
            <span class="cell-dots">
              <i v-if="cell.scheduleCount" class="dot schedule-dot"></i>
              <i v-if="cell.todoCount" class="dot todo-dot"></i>
            </span>
            <span v-if="cell.scheduleCount" class="cell-pill schedule-pill"
              >{{ cell.scheduleCount }} 日程</span
            >
            <span v-if="cell.todoCount" class="cell-pill todo-pill"
              >{{ cell.todoCount }} 待办</span
            >
          </button>
        </div>

        <aside class="date-detail">
          <div class="detail-header">
            <div>
              <p class="panel-kicker">DATE DETAIL</p>
              <h3>{{ selectedDateLabel }}</h3>
              <p>
                {{ selectedDateSchedules.length }} 个日程 ·
                {{ selectedDateTodos.length }} 个待办
              </p>
            </div>
          </div>

          <div class="date-form-card schedule-create">
            <div class="form-heading">
              <strong>添加指定时间日程</strong>
              <span>用于记录某一天、某个时间段内确定要发生的安排</span>
            </div>
            <div class="date-form-row schedule-form-row">
              <input
                v-model="newScheduleTitle"
                class="text-input"
                placeholder="输入日程内容..."
              />
              <label class="date-field-label">
                <span>日期</span>
                <input
                  v-model="newScheduleDate"
                  class="date-input"
                  type="date"
                />
              </label>
              <label class="date-field-label">
                <span>开始</span>
                <input
                  class="time-input"
                  type="time"
                  :value="newScheduleStartTime"
                  @change="handleScheduleStartTimeChange"
                />
              </label>
              <label class="date-field-label">
                <span>结束</span>
                <input
                  class="time-input"
                  type="time"
                  :value="newScheduleEndTime"
                  @change="handleScheduleEndTimeChange"
                />
              </label>
              <button
                class="primary-btn"
                :disabled="!newScheduleTitle.trim()"
                @click="handleAddSchedule"
              >
                添加日程
              </button>
            </div>
          </div>

          <div class="date-form-card selected-todo-create">
            <div class="form-heading">
              <strong>添加指定日期待办</strong>
              <span>用于记录需要完成的任务，可直接选择未来日期</span>
            </div>
            <div class="date-form-row todo-form-row">
              <input
                v-model="newSelectedDateTodoContent"
                class="text-input"
                placeholder="输入待办内容..."
              />
              <label class="date-field-label">
                <span>计划日期</span>
                <input
                  v-model="newSelectedDateTodoDate"
                  class="date-input"
                  type="date"
                />
              </label>
              <select
                v-model="newSelectedDateTodoScene"
                class="select-input scene-input"
              >
                <option value="deep_work">深度工作</option>
                <option value="collaboration">协作沟通</option>
                <option value="admin">行政事务</option>
                <option value="learning">学习复盘</option>
              </select>
              <input
                v-model="newSelectedDateTodoEstimatedMinutes"
                class="text-input estimate-input"
                type="number"
                min="5"
                step="5"
                placeholder="预估分钟"
              />
              <input
                v-model="newSelectedDateTodoTags"
                class="text-input tags-input"
                placeholder="标签，用逗号分隔"
              />
              <select
                v-model="newSelectedDateTodoPriority"
                class="select-input"
              >
                <option value="high">高优先级</option>
                <option value="medium">中优先级</option>
                <option value="low">低优先级</option>
              </select>
              <button
                class="secondary-primary-btn"
                :disabled="!newSelectedDateTodoContent.trim()"
                @click="handleAddSelectedDateTodo"
              >
                添加待办
              </button>
            </div>
          </div>

          <div class="detail-columns">
            <div class="detail-card">
              <h4>当天日程</h4>
              <ul class="compact-list">
                <li
                  v-for="schedule in selectedDateSchedules"
                  :key="schedule.id"
                  class="schedule-item"
                >
                  <div class="schedule-main">
                    <span class="time-badge">{{
                      formatScheduleTime(schedule)
                    }}</span>
                    <strong>{{ schedule.title }}</strong>
                    <div
                      class="linked-docs"
                      v-if="schedule.linkedDocuments?.length"
                    >
                      <button
                        v-for="doc in schedule.linkedDocuments"
                        :key="doc.path"
                        class="doc-chip"
                        @click="openLinkedDocument(doc.path)"
                      >
                        <LinkIcon :size="12" />{{ doc.name }}
                        <span
                          @click.stop="
                            dashboardStore.unlinkDocumentFromSchedule(
                              schedule.id,
                              doc.path,
                            )
                          "
                          >×</span
                        >
                      </button>
                    </div>
                    <div
                      class="schedule-todos"
                      v-if="dashboardStore.todosBySchedule(schedule.id).length"
                    >
                      <span
                        v-for="todo in dashboardStore.todosBySchedule(
                          schedule.id,
                        )"
                        :key="todo.id"
                        class="related-todo"
                        >{{ todo.content }}</span
                      >
                    </div>
                  </div>
                  <div class="row-actions">
                    <button
                      class="icon-btn"
                      title="关联当前文档"
                      @click="linkCurrentDocumentToSchedule(schedule.id)"
                    >
                      <LinkIcon :size="15" />
                    </button>
                    <button
                      class="icon-btn"
                      title="选择文档"
                      @click="selectAndLinkDocumentToSchedule(schedule.id)"
                    >
                      <FolderIcon :size="15" />
                    </button>
                    <button
                      class="icon-btn danger"
                      title="删除"
                      @click="dashboardStore.removeSchedule(schedule.id)"
                    >
                      <TrashIcon :size="15" />
                    </button>
                  </div>
                </li>
                <li
                  v-if="selectedDateSchedules.length === 0"
                  class="empty-state compact"
                >
                  这一天还没有安排。
                </li>
              </ul>
            </div>

            <div class="detail-card">
              <h4>当天待办</h4>
              <ul class="compact-list">
                <TodoRow
                  v-for="todo in selectedDateTodos"
                  :key="todo.id"
                  compact
                  :todo="todo"
                  :schedules="
                    selectedDateSchedules.length
                      ? selectedDateSchedules
                      : currentMonthSchedules
                  "
                  :show-focus-action="
                    selectedDate === today && todo.status !== 'done'
                  "
                  @toggle="handleTodoToggle"
                  @focus="handleTodoFocus"
                  @remove="dashboardStore.removeTodo"
                  @activate="dashboardStore.activateHistoricalTodo"
                  @link-current="linkCurrentDocumentToTodo"
                  @select-doc="selectAndLinkDocumentToTodo"
                  @open-doc="openLinkedDocument"
                  @unlink-doc="dashboardStore.unlinkDocumentFromTodo"
                  @link-schedule="dashboardStore.linkTodoToSchedule"
                  @unlink-schedule="dashboardStore.unlinkTodoFromSchedule"
                />
                <li
                  v-if="selectedDateTodos.length === 0"
                  class="empty-state compact"
                >
                  这一天暂无待办。
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </section>
    </main>

    <ReviewModal
      :todo="completingTodo"
      :current-file-path="fileStore.currentFilePath || undefined"
      @cancel="cancelComplete"
      @open-doc="openLinkedDocument"
      @submit="handleReviewSubmit"
    />
    <LegacyRescheduleModal
      :todo="legacyEditingTodo"
      :default-date="today"
      @cancel="cancelLegacyReschedule"
      @submit="handleLegacyRescheduleSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import {
  useDashboardStore,
  type ScheduleItem,
  type TodoFeeling,
  type TodoItem,
} from "../store/modal/dashboard";
import { useKnowledgeGraphStore } from "../store/modal/knowledgeGraph";
import { useFileStore } from "../store/modal/file";
import { FolderIcon, LinkIcon, RestoreIcon, TrashIcon } from "./icons";
import { notifyError, notifySuccess } from "../utils/notifications";
import CoachFeedbackPanel from "./dashboard/CoachFeedbackPanel.vue";
import FocusZone from "./dashboard/FocusZone.vue";
import LegacyRescheduleModal, {
  type LegacyReschedulePayload,
} from "./dashboard/LegacyRescheduleModal.vue";
import ReviewModal, {
  type ReviewModalSubmitPayload,
} from "./dashboard/ReviewModal.vue";

const PriorityHighIcon = (props: { size?: number }) => {
  const size = props.size || 16;
  return h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: "priority-icon high",
    },
    [h("path", { d: "m17 11-5-5-5 5" }), h("path", { d: "m17 18-5-5-5 5" })],
  );
};

const PriorityMediumIcon = (props: { size?: number }) => {
  const size = props.size || 16;
  return h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: "priority-icon medium",
    },
    [
      h("line", { x1: "5", y1: "9", x2: "19", y2: "9" }),
      h("line", { x1: "5", y1: "15", x2: "19", y2: "15" }),
    ],
  );
};

const PriorityLowIcon = (props: { size?: number }) => {
  const size = props.size || 16;
  return h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: "priority-icon low",
    },
    [h("path", { d: "m7 15 5 5 5-5" }), h("path", { d: "m7 8 5 5 5-5" })],
  );
};

const FocusIcon = (props: { size?: number }) => {
  const size = props.size || 16;
  return h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    [
      h("circle", { cx: "12", cy: "12", r: "7" }),
      h("path", { d: "M12 3v3" }),
      h("path", { d: "M12 18v3" }),
      h("path", { d: "M3 12h3" }),
      h("path", { d: "M18 12h3" }),
    ],
  );
};

interface CoachFeedbackCard {
  id: string;
  title: string;
  level: "attention" | "positive" | "warning";
  judgement: string;
  evidence: string;
  essence: string;
  action: string;
  method: string;
}

const TodoRow = defineComponent({
  props: {
    todo: { type: Object as () => TodoItem, required: true },
    schedules: { type: Array as () => ScheduleItem[], required: true },
    historical: { type: Boolean, default: false },
    compact: { type: Boolean, default: false },
    showFocusAction: { type: Boolean, default: false },
    metaText: { type: String, default: "" },
    statusTag: { type: String, default: "" },
    statusTagClass: { type: String, default: "neutral" },
  },
  emits: [
    "toggle",
    "remove",
    "activate",
    "link-current",
    "select-doc",
    "open-doc",
    "unlink-doc",
    "link-schedule",
    "unlink-schedule",
    "focus",
    "manage-legacy",
  ],
  setup(props, { emit }) {
    const scheduleTitle = computed(
      () =>
        props.schedules.find((s) => s.id === props.todo.scheduleId)?.title ||
        "未关联日程",
    );
    return () =>
      h(
        "li",
        {
          class: [
            "todo-row",
            `priority-${props.todo.priority || "medium"}`,
            {
              completed: props.todo.completed,
              compact: props.compact,
              historical: props.historical,
            },
          ],
        },
        [
          h("div", { class: "todo-body" }, [
            h("div", { class: "todo-title-line" }, [
              h(
                "button",
                {
                  class: "todo-checkbox",
                  title: props.todo.completed ? "标记为未完成" : "标记为已完成",
                  "aria-label": props.todo.completed
                    ? "标记为未完成"
                    : "标记为已完成",
                  onClick: () => emit("toggle", props.todo.id),
                },
                props.todo.completed ? "✓" : "",
              ),
              h(
                "div",
                {
                  class: "priority-indicator",
                  title: priorityLabel(props.todo.priority),
                },
                [
                  props.todo.priority === "high"
                    ? h(PriorityHighIcon, { size: 14 })
                    : props.todo.priority === "low"
                      ? h(PriorityLowIcon, { size: 14 })
                      : h(PriorityMediumIcon, { size: 14 }),
                ],
              ),
              h("span", { class: "todo-title" }, props.todo.content),
            ]),
            h("div", { class: "todo-meta" }, [
              h("span", props.metaText || todoMetaText(props.todo)),
              props.statusTag
                ? h(
                    "span",
                    { class: ["status-tag", props.statusTagClass] },
                    props.statusTag,
                  )
                : null,
              props.todo.scheduleId
                ? h(
                    "button",
                    {
                      class: "schedule-tag",
                      onClick: () => emit("unlink-schedule", props.todo.id),
                    },
                    `日程：${scheduleTitle.value} ×`,
                  )
                : null,
            ]),
            props.todo.completionNote && props.todo.completed
              ? h(
                  "div",
                  { class: "completion-note" },
                  props.todo.completionNote,
                )
              : null,
            props.todo.scene || props.todo.tags?.length
              ? h("div", { class: "todo-taxonomy" }, [
                  props.todo.scene
                    ? h(
                        "span",
                        { class: ["taxonomy-chip", "scene-chip"] },
                        sceneLabel(props.todo.scene),
                      )
                    : null,
                  ...(props.todo.tags || []).map((tag) =>
                    h("span", { class: "taxonomy-chip", key: tag }, `#${tag}`),
                  ),
                ])
              : null,
            props.todo.linkedDocuments?.length
              ? h(
                  "div",
                  { class: "linked-docs" },
                  props.todo.linkedDocuments.map((doc) =>
                    h(
                      "button",
                      {
                        class: "doc-chip",
                        key: doc.path,
                        onClick: () => emit("open-doc", doc.path),
                      },
                      [
                        h(LinkIcon, { size: 12 }),
                        doc.name,
                        h(
                          "span",
                          {
                            onClick: (event: Event) => {
                              event.stopPropagation();
                              emit("unlink-doc", props.todo.id, doc.path);
                            },
                          },
                          "×",
                        ),
                      ],
                    ),
                  ),
                )
              : null,
            h(
              "select",
              {
                class: "schedule-select",
                value: props.todo.scheduleId || "",
                onChange: (event: Event) => {
                  const { value } = event.target as HTMLSelectElement;
                  if (value) emit("link-schedule", props.todo.id, value);
                },
              },
              [
                h("option", { value: "" }, "关联到日程"),
                ...props.schedules.map((schedule) =>
                  h(
                    "option",
                    { value: schedule.id, key: schedule.id },
                    `${schedule.date} ${schedule.title}`,
                  ),
                ),
              ],
            ),
          ]),
          h("div", { class: "row-actions" }, [
            props.historical
              ? h(
                  "button",
                  {
                    class: "icon-btn promote",
                    title: "移至今日",
                    onClick: () => emit("activate", props.todo.id),
                  },
                  [h(RestoreIcon, { size: 15 })],
                )
              : null,
            props.historical
              ? h(
                  "button",
                  {
                    class: "icon-btn annotate",
                    title: "标注并改期",
                    onClick: () => emit("manage-legacy", props.todo.id),
                  },
                  "改",
                )
              : null,
            props.showFocusAction && !props.todo.completed
              ? h(
                  "button",
                  {
                    class: "icon-btn focus",
                    title: "进入专注",
                    onClick: () => emit("focus", props.todo.id),
                  },
                  [h(FocusIcon, { size: 15 })],
                )
              : null,
            h(
              "button",
              {
                class: "icon-btn",
                title: "关联当前文档",
                onClick: () => emit("link-current", props.todo.id),
              },
              [h(LinkIcon, { size: 15 })],
            ),
            h(
              "button",
              {
                class: "icon-btn",
                title: "选择文档",
                onClick: () => emit("select-doc", props.todo.id),
              },
              [h(FolderIcon, { size: 15 })],
            ),
            h(
              "button",
              {
                class: "icon-btn danger",
                title: "删除",
                onClick: () => emit("remove", props.todo.id),
              },
              [h(TrashIcon, { size: 15 })],
            ),
          ]),
        ],
      );
  },
});

const dashboardStore = useDashboardStore();
const knowledgeStore = useKnowledgeGraphStore();
const fileStore = useFileStore();

const today = toDateKey(new Date());
const selectedDate = ref(today);
const visibleMonth = ref(today.slice(0, 7));
const showHistoryPanel = ref(false);
const historyMode = ref<"completed" | "legacy">("completed");
const newTodoContent = ref("");
const newTodoScene = ref<TodoItem["scene"]>("deep_work");
const newTodoEstimatedMinutes = ref("");
const newTodoTags = ref("");
const newTodoPriority = ref<TodoItem["priority"]>("medium");
const newSelectedDateTodoContent = ref("");
const newSelectedDateTodoDate = ref(selectedDate.value);
const newSelectedDateTodoScene = ref<TodoItem["scene"]>("deep_work");
const newSelectedDateTodoEstimatedMinutes = ref("");
const newSelectedDateTodoTags = ref("");
const newSelectedDateTodoPriority = ref<TodoItem["priority"]>("medium");
const newScheduleTitle = ref("");
const newScheduleDate = ref(selectedDate.value);
const newScheduleStartTime = ref("");
const newScheduleEndTime = ref("");
const liveNow = ref(Date.now());

const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];
const currentDate = computed(() =>
  new Date().toLocaleDateString("zh-CN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
);
const currentMonthSchedules = computed(() =>
  dashboardStore.schedulesByMonth(visibleMonth.value),
);
const selectedDateSchedules = computed(() =>
  dashboardStore.schedulesByDate(selectedDate.value),
);
const selectedDateTodos = computed(() =>
  dashboardStore.todosByDate(selectedDate.value),
);
const selectedDateLabel = computed(() =>
  new Date(`${selectedDate.value}T00:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }),
);
const visibleMonthTitle = computed(() =>
  new Date(`${visibleMonth.value}-01T00:00:00`).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
  }),
);
const todayTodos = computed(() => dashboardStore.todayTodos);
const focusedTodo = computed(() => dashboardStore.focusedTodo);
const todayPlannedTodos = computed(() => dashboardStore.todayPlannedTodos);
const todayInProgressTodos = computed(
  () => dashboardStore.todayInProgressTodos,
);
const todayCompletedTodos = computed(() => dashboardStore.todayCompletedTodos);
const historicalTodos = computed(() => dashboardStore.historicalTodos);
const historicalCompletedTodos = computed(
  () => dashboardStore.historicalCompletedTodos,
);
const todayUndoneCount = computed(() => todayInProgressTodos.value.length);
const todayPlannedDoneCount = computed(
  () => todayTodos.value.filter((todo) => todo.completed).length,
);
const todayProgress = computed(() =>
  todayTodos.value.length
    ? Math.round((todayPlannedDoneCount.value / todayTodos.value.length) * 100)
    : 100,
);
const dailyStatusText = computed(
  () =>
    `计划池 ${todayPlannedTodos.value.length} 个 · 专注中 ${focusedTodo.value ? "1" : "0"} 个 · 今日已完成 ${todayCompletedTodos.value.length} 个`,
);
const focusedTodoElapsedMinutes = computed(() => {
  if (!focusedTodo.value?.focusStartedAt) return 0;
  return Math.max(
    1,
    Math.floor(
      (liveNow.value - focusedTodo.value.focusStartedAt) / (60 * 1000),
    ),
  );
});
const coachFeedbackCards = computed<CoachFeedbackCard[]>(() => {
  const cards: CoachFeedbackCard[] = [];
  const overdueCount = historicalTodos.value.length;
  const undocumentedLegacyCount = historicalTodos.value.filter(
    (todo) => !todo.carryoverReason,
  ).length;
  const blockedLegacyCount = historicalTodos.value.filter((todo) =>
    Boolean(todo.blockedReason),
  ).length;
  const plannedCount = todayPlannedTodos.value.length;
  const todayDone = todayCompletedTodos.value;
  const completedWithEstimate = todayDone.filter(
    (todo) => todo.estimatedMinutes && todo.actualMinutes,
  );
  const overrunCount = completedWithEstimate.filter(
    (todo) => (todo.actualMinutes || 0) > (todo.estimatedMinutes || 0) * 1.5,
  ).length;
  const blockedCount = todayDone.filter(
    (todo) =>
      todo.processFeeling === "blocked" || todo.processFeeling === "tiring",
  ).length;

  if (overdueCount >= 3) {
    cards.push({
      id: "legacy-pressure",
      title: "遗留事项开始挤压今天",
      level: "warning",
      judgement:
        "历史遗留已经不只是“过去没做完”，而是在持续占用今天的决策注意力。",
      evidence: `当前历史遗留 ${overdueCount} 项，其中 ${undocumentedLegacyCount} 项还没有原因说明，${blockedLegacyCount} 项已标出阻塞。`,
      essence:
        "只看到“逾期结果”而没有“延期原因”和“重启条件”，任务就会持续沉积。",
      action:
        "今天先挑 1 项最旧遗留，补清原因和阻塞，再决定是移到今天推进还是顺延到明确日期。",
      method:
        "以后每次延期都要写清“为什么没做 + 被什么卡住 + 下次何时再做”，让待办从堆积清单变成可重启系统。",
    });
  }

  if (!focusedTodo.value && plannedCount >= 5) {
    cards.push({
      id: "focus-start",
      title: "启动成本偏高",
      level: "attention",
      judgement:
        "计划池偏大但专注舱空闲，说明你现在更像是在管理任务，而不是推进任务。",
      evidence: `今日计划池 ${plannedCount} 项，当前没有正在专注的任务。`,
      essence: "缺少从“知道要做什么”到“立刻开始做”的单线程启动动作。",
      action: "立刻选 1 项进入专注舱，优先挑 30-60 分钟内能形成结果的任务。",
      method:
        "每天只允许一个 Doing 任务，其他事情停留在计划池，靠状态隔离降低切换成本。",
    });
  }

  if (completedWithEstimate.length > 0 && overrunCount > 0) {
    cards.push({
      id: "estimate-drift",
      title: "时间预估偏乐观",
      level: overrunCount >= 2 ? "warning" : "attention",
      judgement:
        "你对任务耗时的判断有偏乐观迹象，容易让日计划看起来可排满、实际上难落地。",
      evidence: `今天有 ${completedWithEstimate.length} 项记录了预估与实耗，其中 ${overrunCount} 项超出预估 50% 以上。`,
      essence: "任务颗粒度偏粗，或把协作沟通、上下文切换这些隐性成本漏掉了。",
      action: "对超过 60 分钟的任务，下次先拆成可验收的小闭环，再分别估时。",
      method:
        "先估最小可交付动作，再额外留出 20%-30% 缓冲，不用一次性估完整件事。",
    });
  }

  if (focusedTodo.value && focusedTodoElapsedMinutes.value >= 90) {
    cards.push({
      id: "long-focus",
      title: "当前专注已进入深水区",
      level: "attention",
      judgement:
        "持续长时间专注是好事，但如果没有阶段性检查，容易陷入“很忙但不收口”。",
      evidence: `当前专注任务已持续约 ${focusedTodoElapsedMinutes.value} 分钟。`,
      essence: "执行很深入，但缺少中途校准和收口节点。",
      action:
        "现在做一次 2 分钟中检：写下已完成、卡点和下一步，再决定继续还是先收一个阶段结果。",
      method:
        "对深度任务按 45-90 分钟切段，每一段都留下可见产出，而不是只堆时间。",
    });
  }

  if (todayDone.length >= 2 && blockedCount === 0 && overdueCount === 0) {
    cards.push({
      id: "positive-rhythm",
      title: "今天的执行节奏是健康的",
      level: "positive",
      judgement:
        "你已经形成了“计划后推进、推进后收口”的良性节奏，可以开始沉淀自己的工作模板。",
      evidence: `今日已完成 ${todayDone.length} 项，暂无历史遗留，复盘中没有明显卡壳信号。`,
      essence: "当前节奏说明任务颗粒度和推进顺序是匹配的。",
      action: "把今天最顺的一项任务复盘成模板：前置条件、关键动作、完成标准。",
      method: "不要只复盘问题，也要复盘成功路径，把顺手的方法固化成个人 SOP。",
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: "baseline",
      title: "反馈面板已启动",
      level: "positive",
      judgement:
        "工作台已经开始记录计划、专注和复盘，接下来重点是把数据喂成稳定的个人工作方法。",
      evidence: "当前数据量还不大，教练卡片会随着更多复盘信息逐渐变得更准确。",
      essence: "先把记录动作做轻，反馈质量会随着数据积累自然变强。",
      action: "优先在完成任务时补充“实际耗时 + 执行感受 + 一句复盘”。",
      method: "高质量反馈来自持续、低摩擦的数据输入，而不是一次性写很长总结。",
    });
  }

  return cards.slice(0, 3);
});
const activeHistoryTodos = computed(() =>
  historyMode.value === "completed"
    ? historicalCompletedTodos.value
    : historicalTodos.value,
);
const groupedHistoryTodos = computed(() => {
  const groups = new Map<string, TodoItem[]>();
  activeHistoryTodos.value.forEach((todo) => {
    const groupDate =
      historyMode.value === "completed" && todo.completedAt
        ? toDateKey(new Date(todo.completedAt))
        : todo.plannedDate;
    const list = groups.get(groupDate) || [];
    list.push(todo);
    groups.set(groupDate, list);
  });
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, todos]) => ({
      date,
      todos: todos.sort((a, b) =>
        historyMode.value === "completed"
          ? (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt)
          : b.plannedDate.localeCompare(a.plannedDate) ||
            b.createdAt - a.createdAt,
      ),
    }));
});
const historyPanelDescription = computed(() =>
  historyMode.value === "completed"
    ? "按实际完成日期回顾任务收口情况，历史补完会显示在完成当天"
    : "按原计划日期查看仍未完成的历史任务，便于集中清理遗留事项",
);
const historyEmptyText = computed(() =>
  historyMode.value === "completed"
    ? "暂无历史完成记录。"
    : "暂无历史遗留事项。",
);

const completingTodo = ref<TodoItem | null>(null);
const legacyEditingTodo = ref<TodoItem | null>(null);

let liveTimer: number | undefined;

onMounted(() => {
  liveTimer = window.setInterval(() => {
    liveNow.value = Date.now();
  }, 30000);
});

onBeforeUnmount(() => {
  if (liveTimer) window.clearInterval(liveTimer);
});

function handleTodoToggle(id: string) {
  const todo = dashboardStore.todos.find((t) => t.id === id);
  if (!todo) return;
  if (!todo.completed) {
    openCompletionDialog(todo);
  } else {
    dashboardStore.toggleTodo(id);
  }
}

function handleTodoFocus(id: string) {
  dashboardStore.startTodoFocus(id);
}

function handlePauseFocus(id: string) {
  dashboardStore.pauseTodoFocus(id);
}

function openCompleteFromFocus(id: string) {
  const todo = dashboardStore.todos.find((item) => item.id === id);
  if (todo) openCompletionDialog(todo);
}

function handleReviewSubmit(payload: ReviewModalSubmitPayload) {
  if (completingTodo.value) {
    dashboardStore.completeTodoWithDetails(completingTodo.value.id, {
      note: payload.note,
      docs: payload.linkedDocs,
      actualMinutes: payload.actualMinutes,
      processFeeling: payload.processFeeling,
    });

    payload.derivedTodos.forEach((dt) => {
      dashboardStore.addTodo(dt.content, today, dt.priority, undefined, {
        derivedFromTodoId: completingTodo.value?.id,
      });
    });

    completingTodo.value = null;
  }
}

function cancelComplete() {
  completingTodo.value = null;
}

function openCompletionDialog(todo: TodoItem) {
  completingTodo.value = todo;
}

function openLegacyReschedule(id: string) {
  const todo = dashboardStore.todos.find((item) => item.id === id);
  if (todo) legacyEditingTodo.value = todo;
}

function cancelLegacyReschedule() {
  legacyEditingTodo.value = null;
}

function handleLegacyRescheduleSubmit(payload: LegacyReschedulePayload) {
  if (!legacyEditingTodo.value) return;
  dashboardStore.rescheduleTodo(legacyEditingTodo.value.id, payload);
  legacyEditingTodo.value = null;
}

watch(selectedDate, (date) => {
  newSelectedDateTodoDate.value = date;
  newScheduleDate.value = date;
});

watch([newScheduleStartTime, newScheduleEndTime], () => {
  normalizeScheduleEndTimeIfNeeded();
});

const calendarCells = computed(() => {
  const [year, month] = visibleMonth.value.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month - 1, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const key = toDateKey(date);
    return {
      date: key,
      day: date.getDate(),
      inCurrentMonth: key.startsWith(visibleMonth.value),
      scheduleCount: dashboardStore.schedulesByDate(key).length,
      todoCount: dashboardStore
        .todosByDate(key)
        .filter((todo) => !todo.completed).length,
    };
  });
});

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function changeMonth(offset: number) {
  const [year, month] = visibleMonth.value.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  visibleMonth.value = toDateKey(date).slice(0, 7);
  selectedDate.value = toDateKey(date);
}

function goToday() {
  visibleMonth.value = today.slice(0, 7);
  selectedDate.value = today;
}

function handleAddTodo() {
  if (!newTodoContent.value.trim()) return;
  try {
    const created = dashboardStore.addTodo(
      newTodoContent.value.trim(),
      today,
      newTodoPriority.value,
      undefined,
      {
        estimatedMinutes: parseMinutesInput(newTodoEstimatedMinutes.value),
        scene: newTodoScene.value,
        tags: parseTagInput(newTodoTags.value),
      },
    );
    newTodoContent.value = "";
    newTodoScene.value = "deep_work";
    newTodoEstimatedMinutes.value = "";
    newTodoTags.value = "";
    notifySuccess(`已添加今日待办：${created.content}`);
  } catch (error) {
    notifyError(
      `添加今日待办失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function handleAddSelectedDateTodo() {
  if (!newSelectedDateTodoContent.value.trim()) return;
  const plannedDate = newSelectedDateTodoDate.value || selectedDate.value;
  try {
    const created = dashboardStore.addTodo(
      newSelectedDateTodoContent.value.trim(),
      plannedDate,
      newSelectedDateTodoPriority.value,
      undefined,
      {
        estimatedMinutes: parseMinutesInput(
          newSelectedDateTodoEstimatedMinutes.value,
        ),
        scene: newSelectedDateTodoScene.value,
        tags: parseTagInput(newSelectedDateTodoTags.value),
      },
    );
    selectedDate.value = plannedDate;
    visibleMonth.value = plannedDate.slice(0, 7);
    newSelectedDateTodoContent.value = "";
    newSelectedDateTodoScene.value = "deep_work";
    newSelectedDateTodoEstimatedMinutes.value = "";
    newSelectedDateTodoTags.value = "";
    notifySuccess(`已添加待办：${created.content}`);
  } catch (error) {
    notifyError(
      `添加待办失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const normalizedMinutes = totalMinutes % (24 * 60);
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutesToTime(time: string, minutes: number) {
  return minutesToTime(timeToMinutes(time) + minutes);
}

function handleScheduleStartTimeChange(event: Event) {
  newScheduleStartTime.value = (event.target as HTMLInputElement).value;
  normalizeScheduleEndTimeIfNeeded();
}

function handleScheduleEndTimeChange(event: Event) {
  newScheduleEndTime.value = (event.target as HTMLInputElement).value;
  normalizeScheduleEndTimeIfNeeded();
}

function normalizeScheduleEndTimeIfNeeded() {
  const startTime = newScheduleStartTime.value;
  const endTime = newScheduleEndTime.value;
  if (
    startTime &&
    endTime &&
    timeToMinutes(endTime) <= timeToMinutes(startTime)
  ) {
    newScheduleEndTime.value = addMinutesToTime(startTime, 30);
  }
}

function buildScheduleTime() {
  const startTime = newScheduleStartTime.value;
  const endTime = newScheduleEndTime.value;

  if (!startTime && !endTime)
    return { startTime: undefined, endTime: undefined };

  const normalizedStartTime = startTime || endTime;
  let normalizedEndTime = endTime;

  if (
    !normalizedEndTime ||
    timeToMinutes(normalizedEndTime) <= timeToMinutes(normalizedStartTime)
  ) {
    normalizedEndTime = addMinutesToTime(normalizedStartTime, 30);
  }

  newScheduleStartTime.value = normalizedStartTime;
  newScheduleEndTime.value = normalizedEndTime;
  return { startTime: normalizedStartTime, endTime: normalizedEndTime };
}

function handleAddSchedule() {
  if (!newScheduleTitle.value.trim()) return;
  const scheduleDate = newScheduleDate.value || selectedDate.value;
  const { startTime, endTime } = buildScheduleTime();
  dashboardStore.addSchedule(
    newScheduleTitle.value.trim(),
    scheduleDate,
    startTime,
    endTime,
  );
  selectedDate.value = scheduleDate;
  visibleMonth.value = scheduleDate.slice(0, 7);
  newScheduleTitle.value = "";
  newScheduleStartTime.value = "";
  newScheduleEndTime.value = "";
}

function formatScheduleTime(schedule: ScheduleItem) {
  if (schedule.startTime && schedule.endTime)
    return `${schedule.startTime} - ${schedule.endTime}`;
  if (schedule.startTime) return schedule.startTime;
  if (schedule.endTime) return `截至 ${schedule.endTime}`;
  return "全天";
}

function extractFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function linkCurrentDocumentToTodo(todoId: string) {
  const currentPath = fileStore.currentFilePath;
  if (!currentPath) return notifyError("当前没有打开的文档，无法关联");
  dashboardStore.linkDocumentsToTodo(todoId, [
    { path: currentPath, name: extractFileName(currentPath) },
  ]);
}

function linkCurrentDocumentToSchedule(scheduleId: string) {
  const currentPath = fileStore.currentFilePath;
  if (!currentPath) return notifyError("当前没有打开的文档，无法关联");
  dashboardStore.linkDocumentsToSchedule(scheduleId, [
    { path: currentPath, name: extractFileName(currentPath) },
  ]);
}

async function selectAndLinkDocumentToTodo(todoId: string) {
  const docs = await selectDocuments();
  if (docs.length) dashboardStore.linkDocumentsToTodo(todoId, docs);
}

async function selectAndLinkDocumentToSchedule(scheduleId: string) {
  const docs = await selectDocuments();
  if (docs.length) dashboardStore.linkDocumentsToSchedule(scheduleId, docs);
}

async function selectDocuments() {
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [{ name: "markdown", extensions: ["md", "markdown", "text"] }],
    });
    if (!selected) return [];
    const paths = Array.isArray(selected) ? selected : [selected];
    return paths.map((path) => ({ path, name: extractFileName(path) }));
  } catch (error) {
    notifyError(
      `选择文件失败: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

function openLinkedDocument(path: string) {
  window.dispatchEvent(
    new CustomEvent("open-dashboard-link", { detail: { path } }),
  );
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTime(timestamp?: number) {
  if (!timestamp) return "--:--";
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function overdueDays(plannedDate: string) {
  const todayDate = new Date(`${today}T00:00:00`).getTime();
  const planned = new Date(`${plannedDate}T00:00:00`).getTime();
  return Math.max(1, Math.round((todayDate - planned) / (24 * 60 * 60 * 1000)));
}

function isHistoricalCatchUp(todo: TodoItem) {
  return todo.plannedDate < today;
}

function todayCompletedMeta(todo: TodoItem) {
  const completedText = todo.completedAt
    ? formatTime(todo.completedAt)
    : "今日";
  if (!isHistoricalCatchUp(todo)) return `${completedText} 完成`;
  return `${completedText} 完成 · 原计划 ${formatDateLabel(todo.plannedDate)}`;
}

function historicalTodoMeta(todo: TodoItem) {
  const parts = [
    `原计划 ${formatDateLabel(todo.plannedDate)}`,
    `已逾期 ${overdueDays(todo.plannedDate)} 天`,
  ];
  if (todo.carryoverReason) {
    parts.push(`原因：${todo.carryoverReason}`);
  }
  if (todo.blockedReason) {
    parts.push(`阻塞：${todo.blockedReason}`);
  }
  return parts.join(" · ");
}

function historyTodoMeta(todo: TodoItem) {
  if (historyMode.value === "completed") {
    const completedText = todo.completedAt
      ? formatDateTime(todo.completedAt)
      : "已完成";
    if (!isHistoricalCatchUp(todo)) return `${completedText} 完成`;
    return `${completedText} 完成 · 原计划 ${formatDateLabel(todo.plannedDate)}`;
  }
  return historicalTodoMeta(todo);
}

function priorityLabel(priority?: TodoItem["priority"]) {
  if (priority === "high") return "高优先级";
  if (priority === "low") return "低优先级";
  return "中优先级";
}

function sceneLabel(scene?: TodoItem["scene"]) {
  if (scene === "collaboration") return "协作沟通";
  if (scene === "admin") return "行政事务";
  if (scene === "learning") return "学习复盘";
  return "深度工作";
}

function carryoverTag(todo: TodoItem) {
  if (todo.carryoverKind === "active_reschedule") return "主动延期";
  if (todo.carryoverKind === "passive_delay") return "被动拖延";
  return "";
}

function carryoverTagClass(todo: TodoItem) {
  if (todo.carryoverKind === "passive_delay") return "warning";
  if (todo.carryoverKind === "active_reschedule") return "neutral";
  return "neutral";
}

function feelingLabel(feeling?: TodoFeeling) {
  if (feeling === "blocked") return "执行感受：中途卡壳";
  if (feeling === "tiring") return "执行感受：较为耗能";
  if (feeling === "smooth") return "执行感受：顺畅推进";
  return "";
}

function parseMinutesInput(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed =
    typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

function parseTagInput(value: unknown) {
  if (typeof value !== "string") return undefined;
  const tags = value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index);
  return tags.length ? tags : undefined;
}

function todoMetaText(todo: TodoItem) {
  const parts = [todo.plannedDate];
  if (todo.status === "doing") {
    parts.push("专注中");
  }
  if (todo.scene) {
    parts.push(sceneLabel(todo.scene));
  }
  if (todo.estimatedMinutes) {
    parts.push(`预估 ${todo.estimatedMinutes} 分钟`);
  }
  if (todo.actualMinutes) {
    parts.push(`实耗 ${todo.actualMinutes} 分钟`);
  }
  const feeling = feelingLabel(todo.processFeeling);
  if (feeling) {
    parts.push(feeling);
  }
  return parts.join(" · ");
}
</script>

<style scoped>
.dashboard-container {
  --bg-deep: #070a1f;
  --bg-card: rgba(15, 23, 42, 0.68);
  --border-glass: rgba(255, 255, 255, 0.16);
  --cyan: #22d3ee;
  --blue: #38bdf8;
  --violet: #a78bfa;
  --pink: #fb7185;
  --orange: #fb923c;
  --yellow: #facc15;
  --green: #34d399;
  --text-main: #f8fafc;
  --text-subtle: #a8b3cf;
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  position: relative;
  padding: 30px;
  color: var(--text-main);
  background:
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    radial-gradient(
      circle at 18% 18%,
      rgba(34, 211, 238, 0.22),
      transparent 26%
    ),
    radial-gradient(
      circle at 86% 14%,
      rgba(251, 113, 133, 0.22),
      transparent 24%
    ),
    linear-gradient(135deg, #080b1f 0%, #121a3f 48%, #250f42 100%);
  background-size:
    32px 32px,
    32px 32px,
    auto,
    auto,
    auto;
}

.orb {
  position: fixed;
  z-index: 0;
  width: 260px;
  height: 260px;
  border-radius: 999px;
  filter: blur(44px);
  opacity: 0.42;
  pointer-events: none;
}
.orb-cyan {
  top: 9%;
  left: 44%;
  background: var(--cyan);
}
.orb-pink {
  right: 4%;
  top: 36%;
  background: var(--pink);
}
.orb-orange {
  left: 12%;
  bottom: 4%;
  background: var(--orange);
}

.hero-panel,
.overview-grid,
.workspace-grid,
.history-panel {
  position: relative;
  z-index: 1;
}

.hero-panel,
.glass-panel,
.overview-card {
  border: 1px solid var(--border-glass);
  background: var(--bg-card);
  box-shadow:
    0 20px 70px rgba(0, 0, 0, 0.36),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);
}

.hero-panel {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 26px;
  border-radius: 28px;
  margin-bottom: 18px;
  overflow: hidden;
}
.hero-panel::after {
  content: "";
  position: absolute;
  inset: auto -10% -45% 42%;
  height: 180px;
  background: linear-gradient(
    90deg,
    rgba(34, 211, 238, 0.34),
    rgba(251, 113, 133, 0.28)
  );
  filter: blur(36px);
}

.eyebrow,
.panel-kicker,
.card-kicker {
  margin: 0 0 8px;
  color: var(--cyan);
  font-size: 11px;
  letter-spacing: 2px;
  font-weight: 800;
}
.hero-copy h1 {
  margin: 0;
  font-size: 42px;
  letter-spacing: -1px;
  background: linear-gradient(90deg, #fff, var(--cyan), var(--pink));
  -webkit-background-clip: text;
  color: transparent;
}
.hero-subtitle,
.glass-panel p,
.history-item p {
  margin: 8px 0 0;
  color: var(--text-subtle);
  font-size: 13px;
}
.hero-actions {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.hero-progress {
  margin-top: 22px;
  max-width: 420px;
}
.progress-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--text-subtle);
  font-size: 12px;
}
.progress-meta strong {
  color: var(--green);
}
.progress-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--green), var(--yellow));
  box-shadow: 0 0 18px rgba(52, 211, 153, 0.7);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.overview-card {
  position: relative;
  border-radius: 20px;
  padding: 18px;
  overflow: hidden;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.overview-card:hover,
.todo-row:hover,
.calendar-cell:hover,
.schedule-item:hover {
  transform: translateY(-3px);
}
.overview-card::after {
  content: "";
  position: absolute;
  inset: auto -18% -34% 30%;
  height: 90px;
  filter: blur(20px);
  opacity: 0.8;
}
.card-blue::after {
  background: var(--blue);
}
.card-orange::after {
  background: var(--orange);
}
.card-green::after {
  background: var(--green);
}
.card-violet::after {
  background: var(--violet);
}
.card-cyan::after {
  background: var(--cyan);
}
.card-pink::after {
  background: var(--pink);
}
.overview-value {
  display: block;
  font-size: 34px;
  line-height: 1;
  font-weight: 900;
}
.overview-label {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  font-weight: 700;
}
.overview-card small {
  display: block;
  margin-top: 5px;
  color: var(--text-subtle);
  font-size: 11px;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(430px, 0.86fr) minmax(560px, 1.14fr);
  gap: 18px;
  align-items: start;
}
.glass-panel {
  border-radius: 26px;
  padding: 20px;
}
.panel-header,
.section-title,
.detail-header,
.todo-title-line,
.todo-meta,
.row-actions,
.month-switcher,
.schedule-item,
.history-item {
  display: flex;
  align-items: center;
}
.panel-header {
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
}
.panel-header h2,
.detail-header h3,
.section-title h3,
.detail-card h4 {
  margin: 0;
}
.panel-header h2 {
  font-size: 24px;
}

.quick-create {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.quick-create .primary-btn {
  flex: 1 1 auto;
  white-space: nowrap;
}
.text-input,
.select-input,
.time-input,
.schedule-select {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-main);
  border-radius: 13px;
  padding: 10px 12px;
  outline: none;
}
.text-input::placeholder {
  color: #7d8aad;
}
.text-input {
  flex: 1 1 200px;
  min-width: 0;
}
.scene-input {
  flex: 1 1 124px;
}
.estimate-input {
  flex: 1 1 116px;
}
.tags-input {
  flex: 1 1 160px;
}
.time-input {
  width: 110px;
}
.select-input {
  flex: 1 1 112px;
}
.primary-btn,
.ghost-btn,
.icon-control {
  border: none;
  border-radius: 13px;
  cursor: pointer;
  color: white;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.primary-btn {
  padding: 0 16px;
  background: linear-gradient(135deg, var(--blue), var(--violet), var(--pink));
  box-shadow: 0 12px 28px rgba(167, 139, 250, 0.35);
}
.ghost-btn,
.icon-control {
  padding: 10px 13px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--cyan);
  border: 1px solid rgba(34, 211, 238, 0.25);
}
.primary-btn:hover,
.ghost-btn:hover,
.icon-control:hover {
  transform: translateY(-2px);
}

.section-block + .section-block {
  margin-top: 18px;
}
.legacy-block {
  padding-top: 14px;
  border-top: 1px solid rgba(251, 146, 60, 0.2);
}
.completed-block {
  padding-top: 14px;
  border-top: 1px solid rgba(52, 211, 153, 0.22);
}
.section-title {
  justify-content: space-between;
  margin-bottom: 10px;
}
.section-title span {
  color: var(--text-subtle);
  font-size: 12px;
}
.item-list,
.compact-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.todo-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 13px 13px 13px 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
  overflow: hidden;
}
.todo-row.historical {
  border-color: rgba(251, 146, 60, 0.36);
  box-shadow: 0 0 24px rgba(251, 146, 60, 0.08);
}
.todo-row.compact {
  padding: 10px 10px 10px 14px;
}
.todo-row.completed {
  opacity: 0.68;
  box-shadow: 0 0 22px rgba(52, 211, 153, 0.12);
}
.todo-row.completed .todo-title {
  text-decoration: line-through;
  color: #9aa8c7;
}
.check-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.08);
  color: var(--green);
  cursor: pointer;
}
.todo-body {
  min-width: 0;
}
.todo-title-line {
  justify-content: space-between;
  gap: 8px;
}
.todo-title {
  font-weight: 700;
  word-break: break-word;
}
.todo-meta {
  gap: 8px;
  margin-top: 7px;
  flex-wrap: wrap;
  color: var(--text-subtle);
  font-size: 12px;
}
.schedule-tag,
.related-todo,
.time-badge,
.status-tag {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid transparent;
}
.priority-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-subtle);
  flex: 0 0 auto;
}
.priority-indicator.inline {
  display: inline-flex;
  vertical-align: middle;
}
.priority-icon.high {
  color: var(--pink);
}
.priority-icon.medium {
  color: var(--yellow);
}
.priority-icon.low {
  color: var(--blue);
}
.schedule-tag,
.related-todo {
  background: rgba(34, 211, 238, 0.12);
  color: #a5f3fc;
  border-color: rgba(34, 211, 238, 0.26);
  cursor: pointer;
}
.status-tag.catch-up {
  background: rgba(52, 211, 153, 0.16);
  color: #bbf7d0;
  border-color: rgba(52, 211, 153, 0.28);
}
.status-tag.neutral {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-subtle);
  border-color: rgba(255, 255, 255, 0.16);
}
.status-tag.warning {
  background: rgba(245, 158, 11, 0.14);
  color: #fcd34d;
  border-color: rgba(245, 158, 11, 0.24);
}
.schedule-select {
  width: 100%;
  margin-top: 8px;
  font-size: 12px;
  padding: 8px;
}

.todo-taxonomy {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.taxonomy-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: #f3f5f9;
  color: #5f6b7a;
  font-size: 11px;
}

.taxonomy-chip.scene-chip {
  background: #eef5ff;
  color: #2d6cdf;
}

.linked-docs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.doc-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(167, 139, 250, 0.25);
  border-radius: 999px;
  background: rgba(167, 139, 250, 0.14);
  color: #ddd6fe;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}
.doc-chip span {
  margin-left: 3px;
  color: #c4b5fd;
}
.row-actions {
  gap: 5px;
  align-self: start;
  opacity: 0.72;
  transition: opacity 0.18s ease;
}
.todo-row:hover .row-actions,
.schedule-item:hover .row-actions {
  opacity: 1;
}
.icon-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-subtle);
  cursor: pointer;
}
.icon-btn:hover {
  color: white;
  background: rgba(56, 189, 248, 0.18);
}
.icon-btn.promote:hover {
  background: rgba(251, 146, 60, 0.22);
  color: #fed7aa;
}
.icon-btn.annotate:hover {
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
}
.icon-btn.focus:hover {
  background: rgba(45, 108, 223, 0.16);
  color: #2d6cdf;
}
.icon-btn.danger:hover {
  color: #fecdd3;
  background: rgba(251, 113, 133, 0.2);
}

.calendar-header {
  align-items: flex-start;
}
.month-switcher {
  gap: 10px;
}
.month-switcher strong {
  min-width: 120px;
  text-align: center;
  background: linear-gradient(90deg, var(--cyan), var(--pink));
  -webkit-background-clip: text;
  color: transparent;
}
.icon-control {
  width: 36px;
  height: 36px;
  padding: 0;
  font-size: 22px;
}
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}
.weekday {
  text-align: center;
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 800;
}
.calendar-cell {
  position: relative;
  min-height: 86px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.07);
  padding: 9px;
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 5px;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
}
.calendar-cell.outside {
  opacity: 0.34;
}
.calendar-cell.today {
  border-color: rgba(34, 211, 238, 0.72);
  box-shadow: 0 0 24px rgba(34, 211, 238, 0.18);
}
.calendar-cell.selected {
  background: linear-gradient(
    135deg,
    rgba(167, 139, 250, 0.42),
    rgba(251, 113, 133, 0.32)
  );
  border-color: rgba(255, 255, 255, 0.36);
}
.calendar-cell.hot::after {
  content: "";
  position: absolute;
  top: 9px;
  right: 9px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--pink);
  box-shadow: 0 0 14px var(--pink);
}
.cell-day {
  font-weight: 900;
  font-size: 16px;
}
.cell-dots {
  display: flex;
  gap: 5px;
  min-height: 7px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
}
.schedule-dot {
  background: var(--cyan);
  box-shadow: 0 0 10px var(--cyan);
}
.todo-dot {
  background: var(--orange);
  box-shadow: 0 0 10px var(--orange);
}
.cell-pill {
  width: fit-content;
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 10px;
}
.schedule-pill {
  background: rgba(34, 211, 238, 0.14);
  color: #a5f3fc;
}
.todo-pill {
  background: rgba(251, 146, 60, 0.15);
  color: #fed7aa;
}

.date-detail {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.detail-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.detail-card {
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.detail-card h4 {
  margin-bottom: 10px;
  color: #e0f2fe;
}
.schedule-item {
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: transform 0.18s ease;
}
.schedule-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.time-badge {
  width: fit-content;
  background: rgba(52, 211, 153, 0.15);
  color: #bbf7d0;
  border-color: rgba(52, 211, 153, 0.28);
}
.schedule-todos {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.history-panel {
  margin-top: 18px;
}
.history-panel-first-screen {
  margin: -4px 0 18px;
}
.history-panel-first-screen .panel-header {
  margin-bottom: 14px;
}
.history-panel-first-screen .timeline-list {
  max-height: 900px;
  overflow-y: auto;
  padding-right: 4px;
}
.history-switch {
  display: inline-flex;
  gap: 8px;
  padding: 4px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.history-switch-btn {
  border: none;
  border-radius: 10px;
  padding: 8px 12px;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  font-size: 12px;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}
.history-switch-btn.active {
  background: rgba(34, 211, 238, 0.14);
  color: var(--text-main);
}
.timeline-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.timeline-list::before {
  content: "";
  position: absolute;
  left: 74px;
  top: 8px;
  bottom: 8px;
  width: 1px;
  background: linear-gradient(var(--cyan), var(--pink));
  opacity: 0.55;
}
.timeline-group {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  gap: 18px;
}
.timeline-date {
  color: var(--cyan);
  font-weight: 800;
  font-size: 12px;
  padding-top: 12px;
}
.timeline-group ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.history-item {
  position: relative;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 12px 12px 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.history-item-tags {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: start;
}
.timeline-dot {
  position: absolute;
  left: -25px;
  width: 11px;
  height: 11px;
  border-radius: 999px;
  background: var(--orange);
  box-shadow: 0 0 13px var(--orange);
}
.timeline-dot.done {
  background: var(--green);
  box-shadow: 0 0 13px var(--green);
}
.history-item.completed strong {
  color: #9aa8c7;
  text-decoration: line-through;
}
.empty-state {
  color: var(--text-subtle);
  text-align: center;
  padding: 16px;
  font-size: 13px;
  border-radius: 16px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
}

@media (max-width: 1240px) {
  .overview-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .dashboard-container {
    padding: 18px;
  }
  .hero-panel,
  .detail-columns {
    grid-template-columns: 1fr;
    flex-direction: column;
  }
  .overview-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .quick-create {
    flex-direction: column;
  }
  .hero-actions {
    width: 100%;
  }
}

/* 浅色兼容主题覆盖：与侧边栏、知识库等模块保持一致 */
.dashboard-container {
  --bg-card: #ffffff;
  --border-glass: #dfe3ea;
  --cyan: #2d6cdf;
  --blue: #2d6cdf;
  --violet: #6f5bd7;
  --pink: #dc3545;
  --orange: #f59e0b;
  --yellow: #f59e0b;
  --green: #28a745;
  --text-main: #1f2430;
  --text-subtle: #7a8294;
  color: var(--text-main);
  background: #f4f6fb;
}

.hero-panel,
.glass-panel,
.overview-card {
  background: #ffffff;
  border: 1px solid #dfe3ea;
  box-shadow: 0 8px 24px rgba(31, 36, 48, 0.06);
  backdrop-filter: none;
}

.hero-panel {
  border-radius: 18px;
  padding: 22px;
}

.hero-panel::after,
.overview-card::after {
  display: none;
}

.eyebrow,
.panel-kicker,
.card-kicker {
  color: #2d6cdf;
}

.hero-copy h1 {
  color: #1f2430;
  background: none;
  -webkit-background-clip: initial;
  font-size: 34px;
}

.hero-subtitle,
.glass-panel p,
.history-item p,
.progress-meta,
.section-title span,
.weekday {
  color: #7a8294;
}

.progress-track {
  background: #e8ecf4;
}

.progress-fill {
  background: #2d6cdf;
  box-shadow: none;
}

.overview-card {
  border-radius: 14px;
  padding: 16px;
  border-left: 4px solid #2d6cdf;
}

.card-orange {
  border-left-color: #f59e0b;
}
.card-green {
  border-left-color: #28a745;
}
.card-violet {
  border-left-color: #6f5bd7;
}
.card-cyan {
  border-left-color: #17a2b8;
}
.card-pink {
  border-left-color: #dc3545;
}

.overview-value {
  color: #1f2430;
  font-size: 30px;
}

.overview-card small {
  color: #7a8294;
}

.glass-panel {
  border-radius: 16px;
  padding: 18px;
}

.text-input,
.select-input,
.time-input,
.schedule-select {
  background: #ffffff;
  border: 1px solid #dfe3ea;
  color: #1f2430;
  border-radius: 8px;
}

.text-input::placeholder {
  color: #a0a8b8;
}

.primary-btn,
.secondary-primary-btn {
  min-height: 36px;
  border: none;
  border-radius: 8px;
  background: #2d6cdf;
  color: #ffffff;
  padding: 0 14px;
  box-shadow: none;
}

.primary-btn:hover,
.secondary-primary-btn:hover {
  background: #1f5bc6;
  transform: none;
}

.primary-btn:disabled,
.secondary-primary-btn:disabled {
  background: #aeb8c8;
  opacity: 0.65;
  cursor: not-allowed;
}

.primary-btn:disabled:hover,
.secondary-primary-btn:disabled:hover {
  background: #aeb8c8;
  transform: none;
}

.ghost-btn,
.icon-control {
  min-height: 36px;
  border: 1px solid #dfe3ea;
  border-radius: 8px;
  background: #eef1f7;
  color: #1f2430;
  box-shadow: none;
}

.ghost-btn:hover,
.icon-control:hover {
  background: #dfe4ee;
  transform: none;
}

.todo-row {
  grid-template-columns: 20px minmax(0, 1fr) auto;
  border: 1px solid #e5e9f0;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: none;
}

.todo-row:hover,
.calendar-cell:hover,
.schedule-item:hover,
.overview-card:hover {
  transform: none;
  border-color: #cbd5e1;
}

.todo-row.historical {
  border-color: #f6c77d;
  box-shadow: none;
}

.todo-row.completed {
  opacity: 1;
  box-shadow: none;
}

.todo-row.completed .todo-title {
  color: #9aa3b5;
  text-decoration: line-through;
}

.todo-checkbox {
  width: 17px;
  height: 17px;
  margin-top: 2px;
  border: 1px solid #b8c0cf;
  border-radius: 4px;
  background: #ffffff;
  color: #ffffff;
  font-size: 12px;
  line-height: 15px;
  text-align: center;
  cursor: pointer;
  padding: 0;
}

.todo-row.completed .todo-checkbox {
  background: #28a745;
  border-color: #28a745;
}

.todo-checkbox:hover {
  border-color: #28a745;
}

.schedule-tag,
.related-todo,
.time-badge,
.status-tag {
  background: #eef5ff;
  color: #2d6cdf;
  border-color: #cfe0ff;
}
.status-tag.catch-up {
  background: #eaf8ef;
  color: #1f7a3b;
  border-color: #cdebd6;
}

.doc-chip {
  border-color: #d8d8f2;
  background: #f2f2ff;
  color: #4f46a5;
}

.doc-chip span {
  color: #6f5bd7;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #f3f5f9;
  color: #5f6b7a;
}

.icon-btn:hover {
  background: #e8ecf4;
  color: #1f2430;
}

.icon-btn.promote:hover {
  background: #fff4e0;
  color: #b45309;
}

.icon-btn.danger:hover {
  background: #fff0f2;
  color: #dc3545;
}

.month-switcher strong {
  color: #1f2430;
  background: none;
  -webkit-background-clip: initial;
}

.calendar-cell {
  border: 1px solid #e5e9f0;
  border-radius: 12px;
  background: #ffffff;
  color: #1f2430;
}

.calendar-cell.outside {
  opacity: 0.45;
}

.calendar-cell.today {
  border-color: #2d6cdf;
  box-shadow: none;
}

.calendar-cell.selected {
  background: #eef5ff;
  border-color: #2d6cdf;
}

.calendar-cell.hot::after {
  background: #dc3545;
  box-shadow: none;
}

.schedule-dot,
.todo-dot {
  box-shadow: none;
}

.schedule-dot {
  background: #2d6cdf;
}
.todo-dot {
  background: #f59e0b;
}

.schedule-pill {
  background: #eef5ff;
  color: #2d6cdf;
}

.todo-pill {
  background: #fff4e0;
  color: #b45309;
}

.date-detail {
  border-top: 1px solid #e5e9f0;
}

.detail-card,
.schedule-item,
.history-item {
  background: #ffffff;
  border: 1px solid #e5e9f0;
  border-radius: 12px;
}

.detail-card h4 {
  color: #1f2430;
}

.timeline-list::before {
  background: #cfe0ff;
}

.history-switch {
  background: #f8fafc;
  border-color: #dfe3ea;
}

.history-switch-btn {
  color: #7a8294;
}

.history-switch-btn.active {
  background: #eef5ff;
  color: #1f2430;
}

.timeline-date {
  color: #2d6cdf;
}

.timeline-dot {
  background: #f59e0b;
  box-shadow: none;
}

.timeline-dot.done {
  background: #28a745;
  box-shadow: none;
}

.empty-state {
  color: #7a8294;
  background: #f8fafc;
  border: 1px dashed #dfe3ea;
}
.todo-row {
  grid-template-columns: minmax(0, 1fr) auto;
}

.todo-title-line {
  align-items: center;
  gap: 8px;
}

.todo-title {
  flex: 1;
}

.todo-checkbox {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  margin-top: 0;
  border-radius: 3px;
  font-size: 10px;
  line-height: 12px;
}

.date-input {
  min-height: 36px;
  border: 1px solid #dfe3ea;
  border-radius: 8px;
  padding: 0 10px;
  background: #ffffff;
  color: #1f2430;
}

.form-label {
  flex: 0 0 auto;
  color: #1f2430;
  font-size: 13px;
  font-weight: 700;
}

.date-field-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #7a8294;
  font-size: 12px;
  white-space: nowrap;
}
.date-form-card {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #e5e9f0;
  border-radius: 12px;
  background: #ffffff;
}

.date-form-card + .date-form-card {
  margin-top: 10px;
}

.form-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}

.form-heading strong {
  color: #1f2430;
  font-size: 14px;
}

.form-heading span {
  color: #7a8294;
  font-size: 12px;
}

.date-form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.date-form-row > * {
  flex: 1 1 auto;
}

.date-field-label {
  height: 36px;
  padding: 0 8px;
  border: 1px solid #dfe3ea;
  border-radius: 8px;
  background: #f8fafc;
  flex: 1 1 auto;
}

.date-field-label span {
  color: #7a8294;
}

.date-field-label .time-input,
.date-field-label .date-input {
  min-height: auto;
  height: 28px;
  border: none;
  background: transparent;
  padding: 0;
}

.detail-card {
  padding: 14px;
}

.schedule-item,
.todo-row.compact {
  min-height: 72px;
}

.schedule-main strong {
  color: #1f2430;
  font-size: 14px;
}

.time-badge {
  align-self: flex-start;
}

@media (max-width: 980px) {
  .date-form-row,
  .selected-todo-create .date-form-row {
    flex-direction: column;
    align-items: stretch;
  }

  .date-field-label {
    justify-content: space-between;
  }
}

/* 优先级微弱晕染背景 (方案 B: 极浅色底) */
.todo-row.priority-high {
  background-color: rgba(251, 113, 133, 0.05) !important;
}
.todo-row.priority-medium {
  background-color: rgba(250, 204, 21, 0.05) !important;
}
.todo-row.priority-low {
  background-color: rgba(56, 189, 248, 0.04) !important;
}

.todo-row.priority-high:hover {
  background-color: rgba(251, 113, 133, 0.09) !important;
}
.todo-row.priority-medium:hover {
  background-color: rgba(250, 204, 21, 0.09) !important;
}
.todo-row.priority-low:hover {
  background-color: rgba(56, 189, 248, 0.08) !important;
}

.completion-note {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(52, 211, 153, 0.08);
  border-left: 2px solid var(--green);
  border-radius: 4px;
  font-size: 12px;
  color: #a7f3d0;
  line-height: 1.4;
}

.dashboard-container .completion-note {
  background: #eaf8ef;
  color: #1f7a3b;
}
</style>
