export type WorkActivitySource =
  | 'assistant.task_run'
  | 'assistant.message'
  | 'assistant.timeline'
  | 'workspace.file'
  | 'dashboard.todo'
  | 'dashboard.schedule';

export type WorkActivityKind =
  | 'task_started'
  | 'task_completed'
  | 'discussion'
  | 'tool_activity'
  | 'file_opened'
  | 'file_saved'
  | 'todo_planned'
  | 'todo_completed'
  | 'todo_updated'
  | 'schedule_event';

export type WorkActivityConfidence = 'high' | 'medium' | 'low';

export interface WorkActivityItem {
  id: string;
  source: WorkActivitySource;
  kind: WorkActivityKind;
  title: string;
  detail?: string;
  timestamp: number;
  path?: string;
  confidence: WorkActivityConfidence;
  metadata?: Record<string, unknown>;
}

export type WorkActivityDiagnosticSource = 'assistant' | 'workspace.file' | 'dashboard';

export type WorkActivitySourceStatus = 'ready' | 'partial' | 'empty' | 'error';

export interface WorkActivitySourceDiagnostic {
  source: WorkActivityDiagnosticSource;
  status: WorkActivitySourceStatus;
  recordCount: number;
  issues: string[];
}

export interface WorkActivityCollectionResult {
  date: string;
  diagnostics: WorkActivitySourceDiagnostic[];
  activities: WorkActivityItem[];
  coverageScore: number;
  sourceStats: Record<string, number>;
}

export interface TomorrowPlanSections {
  schedules: string[];
  unfinishedTodos: string[];
  followUps: string[];
}

export interface InsightCard {
  title: string;
  evidence: string[];
  gap: string;
  impact: string;
  nextAction: string;
  methodAdvice: string;
}

export interface TodayWorkReportBrief {
  date: string;
  completed: string[];
  inProgress: string[];
  meetings: string[];
  risks: string[];
  nextPlan: string[];
  tomorrowPlanSections: TomorrowPlanSections;
  insightCards: InsightCard[];
  evidenceSources: string[];
  coverageScore: number;
  diagnostics: WorkActivitySourceDiagnostic[];
  reportMarkdown: string;
  methodTrace: {
    sourceOrder: string[];
    usedSources: string[];
    emptySources: string[];
  };
}
