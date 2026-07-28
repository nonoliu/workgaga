import { defineStore } from 'pinia';

export interface LinkedDocument {
  path: string;
  name: string;
}

export type TodoPriority = 'low' | 'medium' | 'high';
export type TodoStatus = 'planned' | 'doing' | 'done';
export type TodoFeeling = 'smooth' | 'blocked' | 'tiring';
export type TodoCarryoverKind = 'active_reschedule' | 'passive_delay';
export type TodoScene = 'deep_work' | 'collaboration' | 'admin' | 'learning';

export interface TodoItem {
  id: string;
  content: string;
  completed: boolean;
  status: TodoStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  plannedDate: string;
  scheduleId?: string;
  priority?: TodoPriority;
  scene?: TodoScene;
  tags?: string[];
  estimatedMinutes?: number;
  actualMinutes?: number;
  focusStartedAt?: number;
  lastFocusedAt?: number;
  processFeeling?: TodoFeeling;
  carryoverKind?: TodoCarryoverKind;
  carryoverReason?: string;
  blockedReason?: string;
  lastDeferredAt?: number;
  lastDeferredFromDate?: string;
  linkedDocuments?: LinkedDocument[];
  completionNote?: string;
  reviewNote?: string;
  derivedFromTodoId?: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  linkedDocuments?: LinkedDocument[];
}

interface DashboardState {
  todos: TodoItem[];
  schedules: ScheduleItem[];
}

const STORAGE_KEYS = {
  DASHBOARD_STATE: 'cherry_markdown_dashboard_state',
};

const createId = (): string => Date.now().toString() + Math.random().toString(36).slice(2, 7);

const toDateKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const todayKey = (): string => toDateKey(Date.now());

const isSameDate = (timestamp: number | undefined, date: string): boolean =>
  typeof timestamp === 'number' && toDateKey(timestamp) === date;

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const addMinutesToTime = (time: string, minutesToAdd: number): string => {
  const totalMinutes = (timeToMinutes(time) + minutesToAdd) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const normalizeTodoMinutes = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;

const toFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const normalizeTodoStatus = (todo: any, completed: boolean): TodoStatus => {
  if (completed) return 'done';
  if (todo.status === 'doing') return 'doing';
  return 'planned';
};

const normalizeTodoFeeling = (value: unknown): TodoFeeling | undefined =>
  value === 'smooth' || value === 'blocked' || value === 'tiring' ? value : undefined;

const normalizeCarryoverKind = (value: unknown): TodoCarryoverKind | undefined =>
  value === 'active_reschedule' || value === 'passive_delay' ? value : undefined;

const normalizeTodoScene = (value: unknown): TodoScene | undefined =>
  value === 'deep_work' || value === 'collaboration' || value === 'admin' || value === 'learning' ? value : undefined;

const normalizeTodoTags = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index);
  return tags.length ? tags : undefined;
};

const sortPendingTodos = (a: TodoItem, b: TodoItem): number => {
  const rank = (todo: TodoItem) => {
    if (todo.status === 'doing') return 0;
    if (todo.status === 'planned') return 1;
    return 2;
  };
  return rank(a) - rank(b) || (b.lastFocusedAt || b.updatedAt) - (a.lastFocusedAt || a.updatedAt);
};

const normalizeScheduleTime = (startTime?: string, endTime?: string) => {
  if (!startTime && !endTime) return { startTime: undefined, endTime: undefined };

  const normalizedStartTime = startTime || endTime;
  if (!normalizedStartTime) return { startTime: undefined, endTime: undefined };

  let normalizedEndTime = endTime;

  if (!normalizedEndTime || timeToMinutes(normalizedEndTime) <= timeToMinutes(normalizedStartTime)) {
    normalizedEndTime = addMinutesToTime(normalizedStartTime, 30);
  }

  return { startTime: normalizedStartTime, endTime: normalizedEndTime };
};

const normalizeLinkedDocuments = (item: any): LinkedDocument[] | undefined => {
  const docs: LinkedDocument[] = Array.isArray(item.linkedDocuments) ? item.linkedDocuments : [];
  if (item.linkedDocumentPath) {
    docs.push({
      path: item.linkedDocumentPath,
      name: item.linkedDocumentName || item.linkedDocumentPath.split(/[\\/]/).pop() || item.linkedDocumentPath,
    });
  }
  const unique = docs.filter((doc, index) => doc?.path && docs.findIndex((d) => d.path === doc.path) === index);
  return unique.length > 0 ? unique : undefined;
};

const migrateTodo = (todo: any): TodoItem => {
  const createdAt = typeof todo.createdAt === 'number' ? todo.createdAt : Date.now();
  const completed = Boolean(todo.completed) || todo.status === 'done';
  const status = normalizeTodoStatus(todo, completed);
  let completedAt: number | undefined;
  if (typeof todo.completedAt === 'number') {
    completedAt = todo.completedAt;
  } else if (completed) {
    completedAt = typeof todo.updatedAt === 'number' ? todo.updatedAt : createdAt;
  }

  let reviewNote: string | undefined;
  if (typeof todo.reviewNote === 'string') {
    reviewNote = todo.reviewNote;
  } else if (typeof todo.completionNote === 'string') {
    reviewNote = todo.completionNote;
  }

  return {
    id: typeof todo.id === 'string' ? todo.id : createId(),
    content: typeof todo.content === 'string' ? todo.content : '',
    completed: status === 'done',
    status,
    createdAt,
    updatedAt: typeof todo.updatedAt === 'number' ? todo.updatedAt : createdAt,
    completedAt,
    plannedDate: typeof todo.plannedDate === 'string' ? todo.plannedDate : toDateKey(createdAt),
    scheduleId: typeof todo.scheduleId === 'string' ? todo.scheduleId : undefined,
    priority: ['low', 'medium', 'high'].includes(todo.priority) ? todo.priority : 'medium',
    scene: normalizeTodoScene(todo.scene),
    tags: normalizeTodoTags(todo.tags),
    estimatedMinutes: normalizeTodoMinutes(todo.estimatedMinutes),
    actualMinutes: normalizeTodoMinutes(todo.actualMinutes),
    focusStartedAt: status === 'doing' ? (toFiniteNumber(todo.focusStartedAt) ?? createdAt) : undefined,
    lastFocusedAt: toFiniteNumber(todo.lastFocusedAt),
    processFeeling: normalizeTodoFeeling(todo.processFeeling),
    carryoverKind: normalizeCarryoverKind(todo.carryoverKind),
    carryoverReason: typeof todo.carryoverReason === 'string' ? todo.carryoverReason : undefined,
    blockedReason: typeof todo.blockedReason === 'string' ? todo.blockedReason : undefined,
    lastDeferredAt: toFiniteNumber(todo.lastDeferredAt),
    lastDeferredFromDate: typeof todo.lastDeferredFromDate === 'string' ? todo.lastDeferredFromDate : undefined,
    linkedDocuments: normalizeLinkedDocuments(todo),
    completionNote: reviewNote,
    reviewNote,
    derivedFromTodoId: typeof todo.derivedFromTodoId === 'string' ? todo.derivedFromTodoId : undefined,
  };
};

const migrateSchedule = (schedule: any): ScheduleItem => {
  let startTime: string | undefined;
  if (typeof schedule.startTime === 'string') {
    startTime = schedule.startTime;
  } else if (typeof schedule.time === 'string') {
    startTime = schedule.time;
  }

  return {
    id: typeof schedule.id === 'string' ? schedule.id : createId(),
    title: typeof schedule.title === 'string' ? schedule.title : '',
    date: typeof schedule.date === 'string' ? schedule.date : todayKey(),
    startTime,
    endTime: typeof schedule.endTime === 'string' ? schedule.endTime : undefined,
    description: typeof schedule.description === 'string' ? schedule.description : undefined,
    linkedDocuments: normalizeLinkedDocuments(schedule),
  };
};

const loadFromStorage = (): DashboardState => {
  try {
    const savedState = localStorage.getItem(STORAGE_KEYS.DASHBOARD_STATE);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      return {
        todos: Array.isArray(parsed.todos) ? parsed.todos.map(migrateTodo) : [],
        schedules: Array.isArray(parsed.schedules) ? parsed.schedules.map(migrateSchedule) : [],
      };
    }
  } catch (error) {
    console.warn('加载仪表盘状态失败:', error);
  }
  return { todos: [], schedules: [] };
};

const saveToStorage = (state: DashboardState) => {
  try {
    localStorage.setItem(STORAGE_KEYS.DASHBOARD_STATE, JSON.stringify(state));
  } catch (error) {
    console.warn('保存仪表盘状态失败:', error);
  }
};

export const useDashboardStore = defineStore('dashboard', {
  state: (): DashboardState => loadFromStorage(),

  getters: {
    todayTodos: (state) => state.todos.filter((todo) => todo.plannedDate === todayKey()).sort(sortPendingTodos),
    focusedTodo: (state) =>
      [...state.todos]
        .filter((todo) => todo.status === 'doing' && !todo.completed)
        .sort((a, b) => (b.lastFocusedAt || b.updatedAt) - (a.lastFocusedAt || a.updatedAt))[0] || null,
    todayPlannedTodos: (state) =>
      state.todos
        .filter((todo) => todo.plannedDate === todayKey() && !todo.completed && todo.status === 'planned')
        .sort(sortPendingTodos),
    todayInProgressTodos: (state) =>
      state.todos.filter((todo) => todo.plannedDate === todayKey() && !todo.completed).sort(sortPendingTodos),
    todayCompletedTodos: (state) =>
      state.todos
        .filter((todo) => todo.status === 'done' && isSameDate(todo.completedAt, todayKey()))
        .sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt)),
    historicalTodos: (state) =>
      state.todos.filter((todo) => todo.status !== 'done' && todo.plannedDate < todayKey()).sort(sortPendingTodos),
    historicalCompletedTodos: (state) =>
      state.todos
        .filter(
          (todo) =>
            todo.status === 'done' && typeof todo.completedAt === 'number' && toDateKey(todo.completedAt) < todayKey(),
        )
        .sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt)),
    historyTodos: (state) =>
      state.todos.filter((todo) => todo.plannedDate < todayKey()).sort((a, b) => b.createdAt - a.createdAt),
    schedulesByMonth: (state) => (monthPrefix: string) =>
      state.schedules
        .filter((schedule) => schedule.date.startsWith(monthPrefix))
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
          return 0;
        }),
    todosByDate: (state) => (date: string) =>
      state.todos.filter((todo) => todo.plannedDate === date).sort(sortPendingTodos),
    unfinishedTodosByDate: (state) => (date: string) =>
      state.todos.filter((todo) => todo.plannedDate === date && todo.status !== 'done'),
    completedTodosByDate: (state) => (date: string) =>
      state.todos.filter((todo) => todo.plannedDate === date && todo.status === 'done'),
    schedulesByDate: (state) => (date: string) =>
      state.schedules
        .filter((schedule) => schedule.date === date)
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    todosBySchedule: (state) => (scheduleId: string) => state.todos.filter((todo) => todo.scheduleId === scheduleId),
  },

  actions: {
    addTodo(
      content: string,
      plannedDate = todayKey(),
      priority: TodoItem['priority'] = 'medium',
      scheduleId?: string,
      options?: {
        estimatedMinutes?: number;
        derivedFromTodoId?: string;
        scene?: TodoScene;
        tags?: string[];
      },
    ) {
      const now = Date.now();
      const todo: TodoItem = {
        id: createId(),
        content,
        completed: false,
        status: 'planned',
        createdAt: now,
        updatedAt: now,
        plannedDate,
        priority,
        scene: normalizeTodoScene(options?.scene),
        tags: normalizeTodoTags(options?.tags),
        scheduleId,
        estimatedMinutes: normalizeTodoMinutes(options?.estimatedMinutes),
        derivedFromTodoId: options?.derivedFromTodoId,
      };
      this.todos.push(todo);
      this.saveState();
      return todo;
    },

    toggleTodo(id: string) {
      const todo = this.todos.find((t) => t.id === id);
      if (todo) {
        const now = Date.now();
        if (todo.status === 'done') {
          todo.completed = false;
          todo.status = 'planned';
          todo.completedAt = undefined;
        } else {
          todo.completed = true;
          todo.status = 'done';
          todo.completedAt = now;
          todo.focusStartedAt = undefined;
        }
        todo.updatedAt = now;
        this.saveState();
      }
    },

    startTodoFocus(id: string) {
      const todo = this.todos.find((t) => t.id === id);
      if (!todo || todo.status === 'done') return;

      const now = Date.now();
      this.todos.forEach((item) => {
        if (item.id !== id && item.status === 'doing' && !item.completed) {
          item.status = 'planned';
          item.focusStartedAt = undefined;
          item.updatedAt = now;
        }
      });

      todo.completed = false;
      todo.status = 'doing';
      todo.plannedDate = todayKey();
      todo.focusStartedAt = now;
      todo.lastFocusedAt = now;
      todo.updatedAt = now;
      this.saveState();
    },

    pauseTodoFocus(id: string) {
      const todo = this.todos.find((t) => t.id === id);
      if (!todo || todo.status !== 'doing') return;
      todo.status = 'planned';
      todo.focusStartedAt = undefined;
      todo.updatedAt = Date.now();
      this.saveState();
    },

    completeTodoWithDetails(
      id: string,
      details?: {
        note?: string;
        docs?: LinkedDocument[];
        actualMinutes?: number;
        processFeeling?: TodoFeeling;
      },
    ) {
      const todo = this.todos.find((t) => t.id === id);
      if (todo) {
        const now = Date.now();
        todo.completed = true;
        todo.status = 'done';
        const note = details?.note?.trim();
        if (details?.note !== undefined) {
          todo.completionNote = note || undefined;
          todo.reviewNote = note || undefined;
        }
        if (details?.actualMinutes !== undefined) {
          todo.actualMinutes = normalizeTodoMinutes(details.actualMinutes);
        }
        if (details?.processFeeling !== undefined) {
          todo.processFeeling = details.processFeeling;
        }
        todo.completedAt = now;
        todo.updatedAt = now;
        todo.focusStartedAt = undefined;
        todo.lastFocusedAt = now;

        if (details?.docs && details.docs.length > 0) {
          todo.linkedDocuments = [...(todo.linkedDocuments || []), ...details.docs];
          const unique = new Map();
          todo.linkedDocuments.forEach((d) => unique.set(d.path, d));
          todo.linkedDocuments = Array.from(unique.values());
        }

        this.saveState();
      }
    },

    removeTodo(id: string) {
      this.todos = this.todos.filter((t) => t.id !== id);
      this.saveState();
    },

    updateTodoPlannedDate(id: string, plannedDate: string) {
      const todo = this.todos.find((t) => t.id === id);
      if (todo) {
        todo.plannedDate = plannedDate;
        todo.updatedAt = Date.now();
        this.saveState();
      }
    },

    rescheduleTodo(
      id: string,
      payload: {
        plannedDate: string;
        carryoverKind: TodoCarryoverKind;
        carryoverReason?: string;
        blockedReason?: string;
      },
    ) {
      const todo = this.todos.find((t) => t.id === id);
      if (!todo) return;

      const now = Date.now();
      const nextDate = payload.plannedDate || todayKey();
      todo.lastDeferredFromDate = todo.plannedDate;
      todo.plannedDate = nextDate;
      todo.status = 'planned';
      todo.completed = false;
      todo.focusStartedAt = undefined;
      todo.carryoverKind = payload.carryoverKind;
      todo.carryoverReason = payload.carryoverReason?.trim() || undefined;
      todo.blockedReason = payload.blockedReason?.trim() || undefined;
      todo.lastDeferredAt = now;
      todo.updatedAt = now;
      this.saveState();
    },

    linkTodoToSchedule(id: string, scheduleId: string) {
      const todo = this.todos.find((t) => t.id === id);
      const schedule = this.schedules.find((s) => s.id === scheduleId);
      if (todo && schedule) {
        todo.scheduleId = scheduleId;
        todo.plannedDate = schedule.date;
        todo.updatedAt = Date.now();
        this.saveState();
      }
    },

    unlinkTodoFromSchedule(id: string) {
      const todo = this.todos.find((t) => t.id === id);
      if (todo) {
        todo.scheduleId = undefined;
        todo.updatedAt = Date.now();
        this.saveState();
      }
    },

    linkDocumentsToTodo(id: string, docs: LinkedDocument[]) {
      const todo = this.todos.find((t) => t.id === id);
      if (todo) {
        if (!todo.linkedDocuments) todo.linkedDocuments = [];
        docs.forEach((doc) => {
          if (!todo.linkedDocuments!.some((d) => d.path === doc.path)) {
            todo.linkedDocuments!.push(doc);
          }
        });
        todo.updatedAt = Date.now();
        this.saveState();
      }
    },

    unlinkDocumentFromTodo(id: string, path: string) {
      const todo = this.todos.find((t) => t.id === id);
      if (todo?.linkedDocuments) {
        todo.linkedDocuments = todo.linkedDocuments.filter((d) => d.path !== path);
        todo.updatedAt = Date.now();
        this.saveState();
      }
    },

    activateHistoricalTodo(id: string) {
      this.updateTodoPlannedDate(id, todayKey());
    },

    addSchedule(title: string, date: string, startTime?: string, endTime?: string, description?: string) {
      const normalizedTime = normalizeScheduleTime(startTime, endTime);
      this.schedules.push({ id: createId(), title, date, ...normalizedTime, description });
      this.saveState();
    },

    updateSchedule(id: string, payload: Partial<Omit<ScheduleItem, 'id'>>) {
      const schedule = this.schedules.find((s) => s.id === id);
      if (schedule) {
        Object.assign(schedule, payload);
        this.saveState();
      }
    },

    removeSchedule(id: string) {
      this.schedules = this.schedules.filter((s) => s.id !== id);
      this.todos = this.todos.map((todo) => (todo.scheduleId === id ? { ...todo, scheduleId: undefined } : todo));
      this.saveState();
    },

    linkDocumentsToSchedule(id: string, docs: LinkedDocument[]) {
      const schedule = this.schedules.find((s) => s.id === id);
      if (schedule) {
        if (!schedule.linkedDocuments) schedule.linkedDocuments = [];
        docs.forEach((doc) => {
          if (!schedule.linkedDocuments!.some((d) => d.path === doc.path)) {
            schedule.linkedDocuments!.push(doc);
          }
        });
        this.saveState();
      }
    },

    unlinkDocumentFromSchedule(id: string, path: string) {
      const schedule = this.schedules.find((s) => s.id === id);
      if (schedule?.linkedDocuments) {
        schedule.linkedDocuments = schedule.linkedDocuments.filter((d) => d.path !== path);
        this.saveState();
      }
    },

    saveState() {
      saveToStorage(this.$state);
    },
  },
});
