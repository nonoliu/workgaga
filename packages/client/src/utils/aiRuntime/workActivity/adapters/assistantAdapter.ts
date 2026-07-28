import type { WorkActivityItem, WorkActivitySourceDiagnostic } from '../types';

const AI_ASSISTANT_STORAGE_KEY = 'workgaga_ai_assistant_state';

interface StoredAIMessage {
  id?: string;
  conversationId?: string;
  role?: string;
  content?: string;
  createdAt?: number;
  timeline?: Array<{
    id?: string;
    title?: string;
    detail?: string;
    createdAt?: number;
    status?: string;
    type?: string;
  }>;
}

interface StoredAITaskActivity {
  toolName?: string;
  summary?: string;
  ok?: boolean;
  createdAt?: number;
}

interface StoredAITaskRun {
  id?: string;
  goal?: string;
  intent?: string;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
  completedAt?: number;
  progress?: {
    recentActivities?: StoredAITaskActivity[];
  };
}

interface StoredAIAssistantState {
  messages?: Record<string, StoredAIMessage>;
  taskRuns?: StoredAITaskRun[];
}

const isTimestampInRange = (value: number | undefined, startAt: number, endAt: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= startAt && value <= endAt;

const truncateText = (text: string, max = 120): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
};

const createActivityId = (prefix: string, seed: string | number): string => `${prefix}-${seed}`;

const loadAssistantState = (): StoredAIAssistantState => {
  try {
    const raw = localStorage.getItem(AI_ASSISTANT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredAIAssistantState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const getTodayTaskRuns = (taskRuns: StoredAITaskRun[], startAt: number, endAt: number): StoredAITaskRun[] =>
  taskRuns.filter(
    (item) =>
      isTimestampInRange(item.createdAt, startAt, endAt) ||
      isTimestampInRange(item.updatedAt, startAt, endAt) ||
      isTimestampInRange(item.completedAt, startAt, endAt),
  );

const getTodayMessages = (messages: StoredAIMessage[], startAt: number, endAt: number): StoredAIMessage[] =>
  messages.filter((item) => isTimestampInRange(item.createdAt, startAt, endAt));

const getTodayTimelineCount = (messages: StoredAIMessage[], startAt: number, endAt: number): number =>
  messages.reduce((sum, message) => {
    const count = message.timeline?.filter((item) => isTimestampInRange(item.createdAt, startAt, endAt)).length ?? 0;
    return sum + count;
  }, 0);

export const diagnoseAssistantTodayWork = (params: {
  startAt: number;
  endAt: number;
}): WorkActivitySourceDiagnostic => {
  try {
    const state = loadAssistantState();
    const taskRuns = getTodayTaskRuns(state.taskRuns ?? [], params.startAt, params.endAt);
    const messages = getTodayMessages(Object.values(state.messages ?? {}), params.startAt, params.endAt);
    const timelineCount = getTodayTimelineCount(messages, params.startAt, params.endAt);
    const recordCount = taskRuns.length + messages.length + timelineCount;

    return {
      source: 'assistant',
      status: recordCount > 0 ? 'ready' : 'empty',
      recordCount,
      issues: recordCount > 0 ? [] : ['今日没有命中的 AI 对话、任务运行或时间线记录。'],
    };
  } catch (error) {
    return {
      source: 'assistant',
      status: 'error',
      recordCount: 0,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
};

export const collectAssistantTodayActivities = (params: { startAt: number; endAt: number }): WorkActivityItem[] => {
  const state = loadAssistantState();
  const activities: WorkActivityItem[] = [];
  const taskRuns = getTodayTaskRuns(state.taskRuns ?? [], params.startAt, params.endAt);
  const messages = getTodayMessages(Object.values(state.messages ?? {}), params.startAt, params.endAt);

  for (const taskRun of taskRuns) {
    const goal = truncateText(taskRun.goal || taskRun.intent || '未命名任务');
    if (isTimestampInRange(taskRun.createdAt, params.startAt, params.endAt)) {
      activities.push({
        id: createActivityId('task-start', taskRun.id || taskRun.createdAt || goal),
        source: 'assistant.task_run',
        kind: 'task_started',
        title: `开始任务：${goal}`,
        timestamp: taskRun.createdAt!,
        confidence: 'high',
        metadata: {
          taskRunId: taskRun.id,
          intent: taskRun.intent,
          status: taskRun.status,
        },
      });
    }

    if (taskRun.status === 'completed' && isTimestampInRange(taskRun.completedAt, params.startAt, params.endAt)) {
      activities.push({
        id: createActivityId('task-complete', taskRun.id || taskRun.completedAt || goal),
        source: 'assistant.task_run',
        kind: 'task_completed',
        title: `完成任务：${goal}`,
        timestamp: taskRun.completedAt!,
        confidence: 'high',
        metadata: {
          taskRunId: taskRun.id,
          intent: taskRun.intent,
          status: taskRun.status,
        },
      });
    }

    for (const item of taskRun.progress?.recentActivities ?? []) {
      if (!isTimestampInRange(item.createdAt, params.startAt, params.endAt)) continue;
      activities.push({
        id: createActivityId(
          'task-activity',
          `${taskRun.id || goal}-${item.createdAt || Date.now()}-${item.toolName || 'tool'}`,
        ),
        source: 'assistant.timeline',
        kind: 'tool_activity',
        title: truncateText(item.summary || `${item.toolName || '工具'} 活动`),
        timestamp: item.createdAt!,
        confidence: item.ok === false ? 'medium' : 'high',
        metadata: {
          taskRunId: taskRun.id,
          toolName: item.toolName,
          ok: item.ok,
        },
      });
    }
  }

  for (const message of messages) {
    if (!message.content || typeof message.content !== 'string') continue;
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    activities.push({
      id: createActivityId('message', message.id || message.createdAt || message.content.slice(0, 20)),
      source: 'assistant.message',
      kind: 'discussion',
      title: `${message.role === 'user' ? '用户提出' : 'AI 产出'}：${truncateText(message.content)}`,
      detail: truncateText(message.content, 220),
      timestamp: message.createdAt!,
      confidence: 'medium',
      metadata: {
        conversationId: message.conversationId,
        role: message.role,
      },
    });

    for (const item of message.timeline ?? []) {
      if (!isTimestampInRange(item.createdAt, params.startAt, params.endAt)) continue;
      activities.push({
        id: createActivityId('timeline', item.id || `${message.id || message.createdAt}-${item.createdAt}`),
        source: 'assistant.timeline',
        kind: 'tool_activity',
        title: truncateText(item.title || item.detail || '执行步骤'),
        detail: item.detail ? truncateText(item.detail, 220) : undefined,
        timestamp: item.createdAt!,
        confidence: item.status === 'failed' ? 'medium' : 'high',
        metadata: {
          conversationId: message.conversationId,
          timelineType: item.type,
          status: item.status,
        },
      });
    }
  }

  return activities;
};
