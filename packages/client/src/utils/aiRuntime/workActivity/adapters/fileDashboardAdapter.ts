import type { WorkActivityItem, WorkActivitySourceDiagnostic } from '../types';

const FILE_STATE_STORAGE_KEY = 'cherry_markdown_file_state';
const DASHBOARD_STATE_STORAGE_KEY = 'cherry_markdown_dashboard_state';

interface RecentFileLike {
  path: string;
  name: string;
  lastOpened?: number | null;
  lastSaved?: number | null;
  lastAccessed?: number | null;
}

interface TodoItemLike {
  id: string;
  content: string;
  completed: boolean;
  plannedDate: string;
  updatedAt: number;
  completedAt?: number;
  priority?: 'low' | 'medium' | 'high';
  scene?: 'deep_work' | 'collaboration' | 'admin' | 'learning';
  tags?: string[];
}

const normalizeTodoScene = (value: unknown): TodoItemLike['scene'] =>
  value === 'deep_work' || value === 'collaboration' || value === 'admin' || value === 'learning' ? value : undefined;

interface ScheduleItemLike {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  description?: string;
}

const toFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const isTimestampInRange = (value: number | null | undefined, startAt: number, endAt: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= startAt && value <= endAt;

const toDateKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createActivityId = (prefix: string, seed: string | number): string => `${prefix}-${seed}`;

const safeParseStorage = (key: string): Record<string, unknown> => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const loadPersistedRecentFiles = (): RecentFileLike[] => {
  const parsed = safeParseStorage(FILE_STATE_STORAGE_KEY);
  const recentFiles = Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [];
  return recentFiles
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((file) => {
      const path = typeof file.path === 'string' ? file.path : '';
      const name =
        typeof file.name === 'string' && file.name.trim() ? file.name.trim() : (path.split(/[\\/]/).pop() ?? path);
      const lastSaved = toFiniteNumber(file.lastSaved) ?? null;
      const lastOpened = toFiniteNumber(file.lastOpened) ?? null;
      const lastAccessed = toFiniteNumber(file.lastAccessed) ?? lastSaved ?? lastOpened ?? null;
      return {
        path,
        name,
        lastOpened,
        lastSaved,
        lastAccessed,
      };
    })
    .filter((file) => Boolean(file.path));
};

const loadPersistedTodos = (): TodoItemLike[] => {
  const parsed = safeParseStorage(DASHBOARD_STATE_STORAGE_KEY);
  const todos = Array.isArray(parsed.todos) ? parsed.todos : [];
  return todos
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((todo, index) => {
      const createdAt = toFiniteNumber(todo.createdAt) ?? Date.now();
      const updatedAt = toFiniteNumber(todo.updatedAt) ?? createdAt;
      const priority: TodoItemLike['priority'] =
        todo.priority === 'low' || todo.priority === 'medium' || todo.priority === 'high' ? todo.priority : 'medium';
      return {
        id: typeof todo.id === 'string' && todo.id ? todo.id : `todo-${index}-${createdAt}`,
        content: typeof todo.content === 'string' ? todo.content : '',
        completed: Boolean(todo.completed),
        plannedDate: typeof todo.plannedDate === 'string' && todo.plannedDate ? todo.plannedDate : toDateKey(createdAt),
        updatedAt,
        completedAt: toFiniteNumber(todo.completedAt),
        priority,
        scene: normalizeTodoScene(todo.scene),
        tags: Array.isArray(todo.tags)
          ? todo.tags
              .map((item) => (typeof item === 'string' ? item.trim() : ''))
              .filter(Boolean)
              .filter((tag, tagIndex, list) => list.indexOf(tag) === tagIndex)
          : undefined,
      };
    })
    .filter((todo) => Boolean(todo.content.trim()));
};

const loadPersistedSchedules = (): ScheduleItemLike[] => {
  const parsed = safeParseStorage(DASHBOARD_STATE_STORAGE_KEY);
  const schedules = Array.isArray(parsed.schedules) ? parsed.schedules : [];
  return schedules
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((schedule, index) => ({
      id: typeof schedule.id === 'string' && schedule.id ? schedule.id : `schedule-${index}`,
      title: typeof schedule.title === 'string' && schedule.title ? schedule.title : '未命名日程',
      date: typeof schedule.date === 'string' && schedule.date ? schedule.date : '',
      startTime: typeof schedule.startTime === 'string' ? schedule.startTime : undefined,
      endTime: typeof schedule.endTime === 'string' ? schedule.endTime : undefined,
      description: typeof schedule.description === 'string' ? schedule.description : undefined,
    }))
    .filter((schedule) => Boolean(schedule.date));
};

export const loadPersistedFileDashboardState = (): {
  recentFiles: RecentFileLike[];
  todos: TodoItemLike[];
  schedules: ScheduleItemLike[];
} => ({
  recentFiles: loadPersistedRecentFiles(),
  todos: loadPersistedTodos(),
  schedules: loadPersistedSchedules(),
});

export const diagnoseFileDashboardTodayWork = (params: {
  startAt: number;
  endAt: number;
  recentFiles: RecentFileLike[];
  todos: TodoItemLike[];
  schedules: ScheduleItemLike[];
}): WorkActivitySourceDiagnostic[] => {
  try {
    const fileCount = params.recentFiles.filter(
      (file) =>
        isTimestampInRange(file.lastOpened, params.startAt, params.endAt) ||
        isTimestampInRange(file.lastSaved, params.startAt, params.endAt) ||
        isTimestampInRange(file.lastAccessed, params.startAt, params.endAt),
    ).length;
    const todayDate = toDateKey(params.startAt);
    const dashboardCount =
      params.todos.filter(
        (todo) =>
          todo.plannedDate === todayDate ||
          isTimestampInRange(todo.updatedAt, params.startAt, params.endAt) ||
          isTimestampInRange(todo.completedAt, params.startAt, params.endAt),
      ).length + params.schedules.filter((schedule) => schedule.date === todayDate).length;

    return [
      {
        source: 'workspace.file',
        status: fileCount > 0 ? 'ready' : 'empty',
        recordCount: fileCount,
        issues: fileCount > 0 ? [] : ['今日没有命中的最近打开或保存文件记录。'],
      },
      {
        source: 'dashboard',
        status: dashboardCount > 0 ? 'ready' : 'empty',
        recordCount: dashboardCount,
        issues: dashboardCount > 0 ? [] : ['今日没有命中的待办或日程记录。'],
      },
    ];
  } catch (error) {
    return [
      {
        source: 'workspace.file',
        status: 'error',
        recordCount: 0,
        issues: [error instanceof Error ? error.message : String(error)],
      },
      {
        source: 'dashboard',
        status: 'error',
        recordCount: 0,
        issues: [error instanceof Error ? error.message : String(error)],
      },
    ];
  }
};

export const collectFileDashboardTodayActivities = (params: {
  startAt: number;
  endAt: number;
  recentFiles: RecentFileLike[];
  todos: TodoItemLike[];
  schedules: ScheduleItemLike[];
}): WorkActivityItem[] => {
  const activities: WorkActivityItem[] = [];
  const todayDate = toDateKey(params.startAt);

  for (const file of params.recentFiles) {
    if (isTimestampInRange(file.lastSaved, params.startAt, params.endAt)) {
      activities.push({
        id: createActivityId('file-saved', `${file.path}-${file.lastSaved}`),
        source: 'workspace.file',
        kind: 'file_saved',
        title: `保存文件：${file.name || file.path}`,
        timestamp: file.lastSaved as number,
        path: file.path,
        confidence: 'medium',
      });
    }

    if (isTimestampInRange(file.lastOpened, params.startAt, params.endAt)) {
      activities.push({
        id: createActivityId('file-opened', `${file.path}-${file.lastOpened}`),
        source: 'workspace.file',
        kind: 'file_opened',
        title: `打开文件：${file.name || file.path}`,
        timestamp: file.lastOpened as number,
        path: file.path,
        confidence: 'low',
      });
    }
  }

  for (const todo of params.todos) {
    if (isTimestampInRange(todo.completedAt, params.startAt, params.endAt)) {
      activities.push({
        id: createActivityId('todo-completed', `${todo.id}-${todo.completedAt}`),
        source: 'dashboard.todo',
        kind: 'todo_completed',
        title: `完成待办：${todo.content}`,
        timestamp: todo.completedAt as number,
        confidence: 'high',
        metadata: {
          todoId: todo.id,
          priority: todo.priority,
        },
      });
    }

    if (isTimestampInRange(todo.updatedAt, params.startAt, params.endAt)) {
      activities.push({
        id: createActivityId('todo-updated', `${todo.id}-${todo.updatedAt}`),
        source: 'dashboard.todo',
        kind: 'todo_updated',
        title: `更新待办：${todo.content}`,
        timestamp: todo.updatedAt,
        confidence: 'medium',
        metadata: {
          todoId: todo.id,
          priority: todo.priority,
        },
      });
    }

    if (todo.plannedDate === todayDate) {
      activities.push({
        id: createActivityId('todo-planned', `${todo.id}-${todayDate}`),
        source: 'dashboard.todo',
        kind: 'todo_planned',
        title: `今日待办：${todo.content}`,
        timestamp: params.startAt,
        confidence: 'medium',
        metadata: {
          todoId: todo.id,
          priority: todo.priority,
        },
      });
    }
  }

  for (const schedule of params.schedules) {
    if (schedule.date !== todayDate) continue;
    activities.push({
      id: createActivityId('schedule', `${schedule.id}-${schedule.date}`),
      source: 'dashboard.schedule',
      kind: 'schedule_event',
      title: `日程：${schedule.title}`,
      detail: schedule.description,
      timestamp: params.startAt,
      confidence: 'medium',
      metadata: {
        scheduleId: schedule.id,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      },
    });
  }

  return activities;
};
