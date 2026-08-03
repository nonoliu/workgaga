<script setup lang="ts">
import { cherryInstance } from './components/CherryMarkdown';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { exists, mkdir, readDir, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { useFileStore, useKnowledgeGraphStore } from './store';
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import SidePanelManager from './components/SidePanelManager.vue';
import Dashboard from './components/Dashboard.vue';
import AIAssistantPage from './components/AIAssistantPage.vue';
import ToastContainer from './components/ui/ToastContainer.vue';
import UnsavedChangesDialog, { type UnsavedDialogResult } from './components/ui/UnsavedChangesDialog.vue';
import type { FileOperationResult } from './components/types';
import { useAppEvents, type OpenFileFromSidebarEvent } from './components/composables/useAppEvents';
import { notifyError, notifySuccess } from './utils/notifications';
import { MESSAGES, DIALOGS } from './constants/i18n';
import { WINDOW_EVENTS } from './constants/events';

// 响应式数据
let workgaga: ReturnType<typeof cherryInstance> | null = null;
const fileStore = useFileStore();
const knowledgeGraphStore = useKnowledgeGraphStore();
const appWindow = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? getCurrentWindow() : null;
let needDealAfterChange = false;
let hasUnsavedChanges = false;
let unlistenCloseRequested: (() => void) | undefined;

const activeMainView = ref<'editor' | 'dashboard' | 'ai'>('dashboard');

const ensureEditorReady = async (show: boolean = true): Promise<NonNullable<typeof workgaga>> => {
  if (show) {
    activeMainView.value = 'editor';
    await nextTick();
  }
  if (!workgaga) {
    workgaga = cherryInstance();
    workgaga.on('afterChange', dealAfterChange);
  }
  return workgaga;
};

const refreshEditorLayout = async (): Promise<void> => {
  await nextTick();
  requestAnimationFrame(() => {
    if (!workgaga) return;
    workgaga.editor?.refresh?.();
    workgaga.$event?.emit?.('layoutChange', {});
    window.dispatchEvent(new Event('resize'));
  });
};

const showEditorView = async (): Promise<NonNullable<typeof workgaga>> => {
  const editor = await ensureEditorReady();
  await refreshEditorLayout();
  return editor;
};

// 加载状态（防止重复点击）
const isLoading = ref(false);

// 未保存对话框状态
const showUnsavedDialog = ref(false);
let unsavedDialogResolve: ((_result: UnsavedDialogResult) => void) | null = null;
const preventNativeContextMenu = (event: Event): void => {
  event.preventDefault();
};

// 暴露未保存更改的检查函数供外部使用
const checkUnsavedChanges = (): boolean => {
  return hasUnsavedChanges;
};

/**
 * 显示三选项未保存对话框
 * @returns 'save' | 'discard' | 'cancel'
 */
const showUnsavedConfirmDialog = (): Promise<UnsavedDialogResult> => {
  return new Promise((resolve) => {
    unsavedDialogResolve = resolve;
    showUnsavedDialog.value = true;
  });
};

const handleUnsavedDialogClose = (_result: UnsavedDialogResult): void => {
  showUnsavedDialog.value = false;
  if (unsavedDialogResolve) {
    unsavedDialogResolve(_result);
    unsavedDialogResolve = null;
  }
};

/**
 * 统一的未保存更改确认逻辑
 * @returns true 表示可以继续操作，false 表示取消
 */
const confirmProceedWhenUnsaved = async (): Promise<boolean> => {
  if (!hasUnsavedChanges) return true;

  const result = await showUnsavedConfirmDialog();

  if (result === 'save') {
    // 保存并继续：只执行保存，不继续后续操作（不销毁当前内容）
    await saveMarkdown();
    return false;
  }
  if (result === 'discard') {
    // 放弃更改，继续操作
    return true;
  }
  // 取消操作
  return false;
};

// ========== 窗口标题管理 ==========
const updateTitle = async (path: string | null, unsaved: boolean = false): Promise<void> => {
  if (path) {
    (window as Window & { __WORKGAGA_CURRENT_FILE__?: string }).__WORKGAGA_CURRENT_FILE__ = path;
  } else {
    delete (window as Window & { __WORKGAGA_CURRENT_FILE__?: string }).__WORKGAGA_CURRENT_FILE__;
  }
  let fileName = '';
  if (path) {
    // 从路径中提取文件名
    const pathParts = path.split(/[\\\\/]/);
    fileName = pathParts[pathParts.length - 1];
  }
  const unsavedIndicator = unsaved ? '● ' : '';
  const title = path ? `${unsavedIndicator}${fileName} - workgaga` : 'workgaga';
  await appWindow?.setTitle(title);
};

const ensureDirectoryExists = async (path: string): Promise<void> => {
  try {
    await readDir(path);
  } catch {
    await mkdir(path, { recursive: true });
  }
};

const getDirectoryPath = (filePath: string): string => filePath.replace(/\\/g, '/').replace(/\/[^/]*$/, '');

const sanitizeFileName = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '').trim();

const getMarkdownTitle = (markdown: string): string | null => {
  const heading = markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^#\s+(.+)$/)?.[1]?.trim())
    .find(Boolean);
  return heading || null;
};

const isDraftDocumentPath = (filePath: string): boolean => /[\\/]Document[\\/]新文档-\d{8}T\d{6}\.md$/.test(filePath);

const resolveTitleFilePath = async (currentPath: string, markdown: string): Promise<string> => {
  if (!isDraftDocumentPath(currentPath)) return currentPath;

  const title = getMarkdownTitle(markdown);
  const safeTitle = title ? sanitizeFileName(title) : '';
  if (!safeTitle) return currentPath;

  const directoryPath = getDirectoryPath(currentPath);
  let candidatePath = `${directoryPath}/${safeTitle}.md`;
  let index = 2;
  while (candidatePath !== currentPath && (await exists(candidatePath))) {
    candidatePath = `${directoryPath}/${safeTitle}-${index}.md`;
    index += 1;
  }
  return candidatePath;
};

const notifyKnowledgeBaseChanged = (path: string): void => {
  window.dispatchEvent(new CustomEvent(WINDOW_EVENTS.KNOWLEDGE_BASE_CHANGED, { detail: { path } }));
};

const normalizeKnowledgePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '');

const isCurrentKnowledgeBase = (path: string): boolean =>
  Boolean(knowledgeGraphStore.vaultPath && normalizeKnowledgePath(knowledgeGraphStore.vaultPath) === normalizeKnowledgePath(path));

const refreshKnowledgeGraphIfNeeded = (filePath: string): void => {
  const knowledgeBase = knowledgeGraphStore.knowledgeBaseForPath(filePath);
  if (!knowledgeBase || !isCurrentKnowledgeBase(knowledgeBase.path)) return;
  window.dispatchEvent(new CustomEvent(WINDOW_EVENTS.KNOWLEDGE_GRAPH_REFRESH_REQUESTED));
};

const addRecentDocument = (filePath: string): void => {
  const knowledgeBase = knowledgeGraphStore.knowledgeBaseForPath(filePath) || knowledgeGraphStore.currentVault;
  fileStore.addRecentFile(filePath, knowledgeBase?.path || null, knowledgeBase?.name || null);
};

const ensureKnowledgeBaseSelected = async (): Promise<boolean> => {
  if (knowledgeGraphStore.vaultPath) return true;

  const selected = await open({ directory: true, multiple: false });
  if (!selected) return false;

  const path = Array.isArray(selected) ? selected[0] : selected;
  await knowledgeGraphStore.setKnowledgeBase(path);
  notifyKnowledgeBaseChanged(path);
  return true;
};

const createKnowledgeDocumentPath = async (
  knowledgeBasePath = knowledgeGraphStore.vaultPath,
): Promise<string | null> => {
  if (!knowledgeBasePath) return null;
  const documentPath = `${knowledgeBasePath.replace(/[\\/]+$/, '')}/Document`;

  await ensureDirectoryExists(documentPath);
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
  return `${documentPath}/新文档-${timestamp}.md`;
};

// ========== 文件操作函数 ==========
const createNewDocumentInKnowledgeBase = async (knowledgeBasePath?: string): Promise<void> => {
  if (!(await confirmProceedWhenUnsaved())) return;

  if (knowledgeBasePath && !isCurrentKnowledgeBase(knowledgeBasePath)) {
    await knowledgeGraphStore.setKnowledgeBase(knowledgeBasePath);
    notifyKnowledgeBaseChanged(knowledgeBasePath);
  } else if (!knowledgeBasePath && !(await ensureKnowledgeBaseSelected())) {
    return;
  }

  const documentPath = await createKnowledgeDocumentPath(knowledgeBasePath || knowledgeGraphStore.vaultPath);
  if (!documentPath) return;

  needDealAfterChange = false;
  hasUnsavedChanges = false;
  const editor = await showEditorView();
  editor.setMarkdown('');
  fileStore.setCurrentFilePath(documentPath);
  (window as Window & { __WORKGAGA_CURRENT_FILE__?: string }).__WORKGAGA_CURRENT_FILE__ = documentPath;
  await updateTitle(documentPath, false);
};

const newFile = async (): Promise<void> => {
  await createNewDocumentInKnowledgeBase();
};

const openFile = async (): Promise<FileOperationResult> => {
  if (isLoading.value) return { success: false, error: DIALOGS.CANCELLED_UNSAVED };
  if (!(await confirmProceedWhenUnsaved())) {
    return { success: false, error: DIALOGS.CANCELLED_UNSAVED };
  }

  isLoading.value = true;
  try {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'markdown',
          extensions: ['md', 'text'],
        },
      ],
    });

    if (path === null) {
      return { success: false, error: MESSAGES.FILE.USER_CANCELLED_SELECT };
    }

    const markdown = await readTextFile(path);
    needDealAfterChange = false;
    hasUnsavedChanges = false;
    const editor = await showEditorView();
    editor.setMarkdown(markdown);
    fileStore.setCurrentFilePath(path);
    (window as Window & { __WORKGAGA_CURRENT_FILE__?: string }).__WORKGAGA_CURRENT_FILE__ = path;

    // 添加到最近访问列表
    addRecentDocument(path);
    await updateTitle(path, false);

    return { success: true, path };
  } catch (error) {
    const message = `${MESSAGES.FILE.OPEN_FAILED}: ${error instanceof Error ? error.message : MESSAGES.UNKNOWN_ERROR}`;
    notifyError(message);
    return { success: false, error: error instanceof Error ? error.message : MESSAGES.UNKNOWN_ERROR };
  } finally {
    isLoading.value = false;
  }
};

const saveAsNewMarkdown = async (): Promise<FileOperationResult> => {
  if (isLoading.value) return { success: false, error: MESSAGES.FILE.USER_CANCELLED };
  isLoading.value = true;
  try {
    const editor = await ensureEditorReady();
    const markdown = editor.getMarkdown();
    const path = await save({
      filters: [
        {
          name: 'workgaga',
          extensions: ['md', 'markdown'],
        },
      ],
    });

    if (!path) {
      return { success: false, error: MESSAGES.FILE.USER_CANCELLED_SAVE };
    }

    await writeTextFile(path, markdown);
    fileStore.setCurrentFilePath(path);
    (window as Window & { __WORKGAGA_CURRENT_FILE__?: string }).__WORKGAGA_CURRENT_FILE__ = path;
    addRecentDocument(path);
    fileStore.markSaved(path);
    hasUnsavedChanges = false;
    await updateTitle(path, false);
    refreshKnowledgeGraphIfNeeded(path);
    notifySuccess(MESSAGES.FILE.SAVE_AS_SUCCESS);

    return { success: true, path };
  } catch (error) {
    const message = `${MESSAGES.FILE.SAVE_AS_FAILED}: ${error instanceof Error ? error.message : MESSAGES.UNKNOWN_ERROR}`;
    notifyError(message);
    return { success: false, error: error instanceof Error ? error.message : MESSAGES.UNKNOWN_ERROR };
  } finally {
    isLoading.value = false;
  }
};

const saveMarkdown = async (): Promise<FileOperationResult> => {
  try {
    const editor = await ensureEditorReady();
    const markdown = editor.getMarkdown();

    if (!fileStore.currentFilePath) {
      return await saveAsNewMarkdown();
    }

    const originalPath = fileStore.currentFilePath;
    const targetPath = await resolveTitleFilePath(originalPath, markdown);

    if (targetPath !== originalPath && (await exists(originalPath))) {
      await rename(originalPath, targetPath);
    }
    await writeTextFile(targetPath, markdown);

    if (targetPath !== originalPath) {
      fileStore.renameRecentFile(originalPath, targetPath);
      fileStore.setCurrentFilePath(targetPath);
      window.dispatchEvent(
        new CustomEvent(WINDOW_EVENTS.DOCUMENT_RENAMED, { detail: { oldPath: originalPath, newPath: targetPath } }),
      );
    }

    addRecentDocument(targetPath);
    fileStore.markSaved(targetPath);
    hasUnsavedChanges = false;
    await updateTitle(targetPath, false);
    refreshKnowledgeGraphIfNeeded(targetPath);
    notifySuccess(MESSAGES.FILE.SAVE_SUCCESS);
    return { success: true, path: targetPath };
  } catch (error) {
    const message = `${MESSAGES.FILE.SAVE_FAILED}: ${error instanceof Error ? error.message : MESSAGES.UNKNOWN_ERROR}`;
    notifyError(message);
    return { success: false, error: error instanceof Error ? error.message : MESSAGES.UNKNOWN_ERROR };
  }
};

type EditorViewMode = 'editOnly' | 'previewOnly' | 'edit&preview';

const setEditorViewMode = async (mode: EditorViewMode): Promise<void> => {
  const editor = await ensureEditorReady();
  editor.wrapperDom.classList.remove('markdown-preview-only');
  editor.switchModel(mode, true);
  editor.previewer.options.enablePreviewerBubble = mode !== 'previewOnly';
};

const handleChangeEditorViewMode = (event: Event): void => {
  const mode = (event as CustomEvent<{ mode?: EditorViewMode }>).detail?.mode;
  if (mode === 'editOnly' || mode === 'previewOnly' || mode === 'edit&preview') {
    void setEditorViewMode(mode);
  }
};

const dealAfterChange = (): void => {
  if (!needDealAfterChange) {
    needDealAfterChange = true;
    return;
  }

  // 标记为有未保存的更改，不进行自动保存
  hasUnsavedChanges = true;
  if (fileStore.currentFilePath) {
    void updateTitle(fileStore.currentFilePath, true);
  }
};

// ========== 文件恢复功能 ==========
const restoreLastOpenedFile = async (): Promise<void> => {
  if (fileStore.currentFilePath) {
    try {
      const markdown = await readTextFile(fileStore.currentFilePath);
      needDealAfterChange = false;
      hasUnsavedChanges = false;
      const editor = await ensureEditorReady(false);
      editor.setMarkdown(markdown);
      console.log('成功恢复上次打开的文件:', fileStore.currentFilePath);
      await updateTitle(fileStore.currentFilePath, false);
    } catch (error) {
      console.warn('恢复上次打开的文件失败:', error);
      // 如果文件不存在或无法访问，清除当前文件路径并从最近记录移除
      fileStore.removeRecentFile(fileStore.currentFilePath);
      fileStore.setCurrentFilePath(null);
      await updateTitle(null, false);
    }
  }
};

// ========== 事件处理函数 ==========
const handleSwitchMainView = (event: Event) => {
  const view = (event as CustomEvent<{ view: 'editor' | 'dashboard' | 'ai' }>).detail?.view;
  if (!view) return;
  if (view === 'editor') {
    void showEditorView();
    return;
  }
  activeMainView.value = view;
};

const openDocumentInEditor = async (path: string): Promise<boolean> => {
  if (!(await confirmProceedWhenUnsaved())) return false;

  try {
    const markdown = await readTextFile(path);
    needDealAfterChange = false;
    hasUnsavedChanges = false;
    const editor = await showEditorView();
    editor.setMarkdown(markdown);
    fileStore.setCurrentFilePath(path);
  (window as Window & { __WORKGAGA_CURRENT_FILE__?: string }).__WORKGAGA_CURRENT_FILE__ = path;
  addRecentDocument(path);
    fileStore.markSaved(path);
    await updateTitle(path, false);
    return true;
  } catch (error) {
    notifyError(`无法打开文档: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
};

const handleOpenDashboardLink = async (event: Event) => {
  const path = (event as CustomEvent<{ path: string }>).detail?.path;
  if (!path) return;
  await openDocumentInEditor(path);
};

const handleOpenDocumentInEditor = async (event: Event): Promise<void> => {
  const { path } = (event as CustomEvent<{ path?: string }>).detail || {};
  if (!path) return;
  const opened = await openDocumentInEditor(path);
  if (opened) {
    window.dispatchEvent(new CustomEvent(`${WINDOW_EVENTS.OPEN_DOCUMENT_IN_EDITOR}:done`, { detail: { path } }));
  }
};

const handleOpenFileFromSidebar = async (event: OpenFileFromSidebarEvent): Promise<void> => {
  const { filePath, content } = event.detail;
  if (!(await confirmProceedWhenUnsaved())) return;
  needDealAfterChange = false;
  hasUnsavedChanges = false;
  const editor = await showEditorView();
  editor.setMarkdown(content);
  fileStore.setCurrentFilePath(filePath);
  await updateTitle(filePath, false);
};

const handleSaveFromToolbar = async (): Promise<void> => {
  const result = await saveMarkdown();
  if (!result.success && result.error) {
    notifyError(`${MESSAGES.FILE.SAVE_FAILED}: ${result.error}`);
  }
};

const handleCreateDocumentInKnowledgeBase = (event: Event): void => {
  const path = (event as CustomEvent<{ path?: string }>).detail?.path;
  if (!path) return;
  void createNewDocumentInKnowledgeBase(path);
};

const renameKnowledgeBaseDocument = async (path: string, name: string): Promise<void> => {
  if (!(await confirmProceedWhenUnsaved())) return;

  const safeName = sanitizeFileName(name);
  if (!safeName) {
    notifyError('文档名称不能为空');
    return;
  }

  const extension = path.match(/\.(md|markdown)$/i)?.[0] || '.md';
  const directoryPath = getDirectoryPath(path);
  let targetPath = `${directoryPath}/${safeName}${extension}`;
  let index = 2;
  while (targetPath !== path && (await exists(targetPath))) {
    targetPath = `${directoryPath}/${safeName}-${index}${extension}`;
    index += 1;
  }

  if (targetPath === path) return;

  try {
    await rename(path, targetPath);
    fileStore.renameRecentFile(path, targetPath);
    if (fileStore.currentFilePath === path) {
      fileStore.setCurrentFilePath(targetPath);
      await updateTitle(targetPath, hasUnsavedChanges);
    }
    window.dispatchEvent(
      new CustomEvent(WINDOW_EVENTS.DOCUMENT_RENAMED, { detail: { oldPath: path, newPath: targetPath } }),
    );
    refreshKnowledgeGraphIfNeeded(targetPath);
    notifySuccess('文档已重命名');
  } catch (error) {
    notifyError(`重命名文档失败：${error instanceof Error ? error.message : String(error)}`);
  }
};

const handleRenameDocumentInKnowledgeBase = (event: Event): void => {
  const { path, name } = (event as CustomEvent<{ path?: string; name?: string }>).detail || {};
  if (!path || !name) return;
  void renameKnowledgeBaseDocument(path, name);
};

const handleKnowledgeGraphRefreshRequested = (): void => {
  void knowledgeGraphStore.refresh();
};

const handleDocumentRenamed = (event: Event): void => {
  const { oldPath, newPath } = (event as CustomEvent<{ oldPath?: string; newPath?: string }>).detail || {};
  if (!oldPath || !newPath || fileStore.currentFilePath !== newPath) return;
  void updateTitle(newPath, hasUnsavedChanges);
};

const handleDocumentDeleted = (event: Event): void => {
  const path = (event as CustomEvent<{ path?: string }>).detail?.path;
  if (!path) return;
  if (fileStore.currentFilePath === path) {
    needDealAfterChange = false;
    hasUnsavedChanges = false;
    workgaga?.setMarkdown('');
    fileStore.setCurrentFilePath(null);
    void updateTitle(null, false);
  }
};

// ========== 工具栏管理 ==========
const toggleToolbar = async (): Promise<void> => {
  const editor = await ensureEditorReady();
  const cherryNoToolbar = document.querySelector('.cherry--no-toolbar');
  if (appWindow) {
    await invoke('get_show_toolbar', { show: !!cherryNoToolbar });
  }
  editor.toolbar.toolbarHandlers.settings('toggleToolbar');
};

// ========== 键盘快捷键处理 ==========
const registerSaveShortcut = async (): Promise<void> => {
  try {
    // 注册 Ctrl+S 保存快捷键
    await register('CommandOrControl+S', async () => {
      if (fileStore.currentFilePath || hasUnsavedChanges) {
        await saveMarkdown();
      }
    });
  } catch (error) {
    console.warn('注册保存快捷键失败:', error);
  }
};

const unregisterSaveShortcut = async (): Promise<void> => {
  try {
    await unregister('CommandOrControl+S');
  } catch (error) {
    console.warn('注销保存快捷键失败:', error);
  }
};

const appEvents = useAppEvents({
  onOpenFileFromSidebar: handleOpenFileFromSidebar,
  onRequestSave: handleSaveFromToolbar,
  tauriHandlers: {
    onNewFile: newFile,
    onOpenFile: openFile,
    onSave: saveMarkdown,
    onSaveAs: saveAsNewMarkdown,
    onToggleToolbar: toggleToolbar,
  },
});

// ========== 生命周期钩子 ==========
onMounted(async () => {
  // 暴露 checkUnsavedChanges 给 window，以便外部可以使用
  (window as any).checkUnsavedChanges = checkUnsavedChanges;

  // 禁用 Tauri 默认右键菜单（防止原生“查看页面元素”）
  document.addEventListener('contextmenu', preventNativeContextMenu);
  window.addEventListener(WINDOW_EVENTS.CREATE_DOCUMENT_IN_KNOWLEDGE_BASE, handleCreateDocumentInKnowledgeBase);
  window.addEventListener(WINDOW_EVENTS.RENAME_DOCUMENT_IN_KNOWLEDGE_BASE, handleRenameDocumentInKnowledgeBase);
  window.addEventListener(WINDOW_EVENTS.KNOWLEDGE_GRAPH_REFRESH_REQUESTED, handleKnowledgeGraphRefreshRequested);
  window.addEventListener(WINDOW_EVENTS.DOCUMENT_RENAMED, handleDocumentRenamed);
  window.addEventListener(WINDOW_EVENTS.DOCUMENT_DELETED, handleDocumentDeleted);
  window.addEventListener('switch-main-view', handleSwitchMainView);
  window.addEventListener('open-dashboard-link', handleOpenDashboardLink);
  window.addEventListener(WINDOW_EVENTS.OPEN_DOCUMENT_IN_EDITOR, handleOpenDocumentInEditor);
  window.addEventListener(WINDOW_EVENTS.CHANGE_EDITOR_VIEW_MODE, handleChangeEditorViewMode);

  // 初始化工具栏状态
  if (appWindow) {
    await invoke('get_show_toolbar', { show: true });
  }
  appEvents.registerWindowEvents();
  if (appWindow) {
    await appEvents.registerTauriEvents();
  }

  // 窗口关闭防护
  if (appWindow) {
    unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
      const canClose = await confirmProceedWhenUnsaved();
      if (!canClose) {
        event.preventDefault();
      }
    });
  }

  // 注册全局保存快捷键
  await registerSaveShortcut();

  // 自动恢复上次打开的文件
  await restoreLastOpenedFile();
});

onUnmounted(async () => {
  document.removeEventListener('contextmenu', preventNativeContextMenu);
  window.removeEventListener(WINDOW_EVENTS.CREATE_DOCUMENT_IN_KNOWLEDGE_BASE, handleCreateDocumentInKnowledgeBase);
  window.removeEventListener(WINDOW_EVENTS.RENAME_DOCUMENT_IN_KNOWLEDGE_BASE, handleRenameDocumentInKnowledgeBase);
  window.removeEventListener(WINDOW_EVENTS.KNOWLEDGE_GRAPH_REFRESH_REQUESTED, handleKnowledgeGraphRefreshRequested);
  window.removeEventListener(WINDOW_EVENTS.DOCUMENT_RENAMED, handleDocumentRenamed);
  window.removeEventListener(WINDOW_EVENTS.DOCUMENT_DELETED, handleDocumentDeleted);
  window.removeEventListener(WINDOW_EVENTS.CHANGE_EDITOR_VIEW_MODE, handleChangeEditorViewMode);
  window.removeEventListener(WINDOW_EVENTS.OPEN_DOCUMENT_IN_EDITOR, handleOpenDocumentInEditor);
  window.removeEventListener('switch-main-view', handleSwitchMainView);
  window.removeEventListener('open-dashboard-link', handleOpenDashboardLink);
  if (unlistenCloseRequested) {
    unlistenCloseRequested();
  }

  // 注销全局保存快捷键
  await unregisterSaveShortcut();
  await appEvents.cleanupAll();
});
</script>

<template>
  <div class="app-container">
    <SidePanelManager />
    <div class="main-view">
      <div class="editor-view" :class="{ active: activeMainView === 'editor' }">
        <div id="markdown-editor"></div>
      </div>
      <Dashboard v-if="activeMainView === 'dashboard'" class="dashboard-view" />
      <AIAssistantPage v-if="activeMainView === 'ai'" class="ai-main-view" />
    </div>
    <ToastContainer />
    <UnsavedChangesDialog :visible="showUnsavedDialog" @close="handleUnsavedDialogClose" />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.main-view {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.editor-view {
  position: absolute;
  inset: 0;
  display: flex;
  min-width: 0;
  min-height: 0;
  visibility: hidden;
  pointer-events: none;
  z-index: 1;
}

.editor-view.active {
  visibility: visible;
  pointer-events: auto;
  z-index: 2;
}

.dashboard-view,
.ai-main-view {
  position: absolute;
  inset: 0;
  z-index: 1;
}

#markdown-editor {
  height: 100%;
  width: 100%;
  flex: 1;
  min-height: 0;
}
</style>
