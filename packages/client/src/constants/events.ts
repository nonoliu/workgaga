export const TAURI_EVENTS = {
  NEW_FILE: 'new_file',
  OPEN_FILE: 'open_file',
  SAVE: 'save',
  SAVE_AS: 'save_as',
  TOGGLE_TOOLBAR: 'toggle_toolbar',
} as const;

export const WINDOW_EVENTS = {
  OPEN_FILE_FROM_SIDEBAR: 'open-file-from-sidebar',
  REQUEST_SAVE: 'cherry:request-save',
  KNOWLEDGE_GRAPH_REFRESH_REQUESTED: 'cherry:knowledge-graph-refresh-requested',
  KNOWLEDGE_BASE_CHANGED: 'cherry:knowledge-base-changed',
  CREATE_DOCUMENT_IN_KNOWLEDGE_BASE: 'cherry:create-document-in-knowledge-base',
  DOCUMENT_RENAMED: 'cherry:document-renamed',
  DOCUMENT_DELETED: 'cherry:document-deleted',
  CHANGE_EDITOR_VIEW_MODE: 'cherry:change-editor-view-mode',
  OPEN_DOCUMENT_IN_EDITOR: 'cherry:open-document-in-editor',
} as const;

export type TauriEventName = (typeof TAURI_EVENTS)[keyof typeof TAURI_EVENTS];
export type WindowEventName = (typeof WINDOW_EVENTS)[keyof typeof WINDOW_EVENTS];
