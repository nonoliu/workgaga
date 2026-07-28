import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewContent } from './webview';
import { uploadFileHandler } from './handler/uploadFile';

// 状态管理器
// 更简化的状态对象
const state = {
  panel: undefined as vscode.WebviewPanel | undefined,
  targetEditor: undefined as vscode.TextEditor | undefined,
  webviewMsgDisposable: undefined as vscode.Disposable | undefined,
  extPath: '',
  scrollTimeout: undefined as ReturnType<typeof setTimeout> | undefined,
  editTimeout: undefined as ReturnType<typeof setTimeout> | undefined,
  exportProgressItem: undefined as vscode.StatusBarItem | undefined,
  exportProgressValue: 0,
  exportTargetDir: undefined as vscode.Uri | undefined,
  disableScroll: false,
  disableEdit: false,
  isPanelInit: false,
  theme: vscode.workspace.getConfiguration('workgaga').get('theme') as string | undefined,
  reset() {
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.editTimeout) clearTimeout(this.editTimeout);
    this.webviewMsgDisposable?.dispose();
    this.exportProgressItem?.dispose();
    this.panel = undefined;
    this.targetEditor = undefined;
    this.webviewMsgDisposable = undefined;
    this.exportProgressItem = undefined;
    this.exportProgressValue = 0;
    this.exportTargetDir = undefined;
    this.scrollTimeout = undefined;
    this.editTimeout = undefined;
    this.disableScroll = false;
    this.disableEdit = false;
    this.isPanelInit = false;
    this.theme = vscode.workspace.getConfiguration('workgaga').get('theme') as string | undefined;
  },
};

export function activate(context: vscode.ExtensionContext) {
  state.extPath = context.extensionPath;
  context.subscriptions.push(
    vscode.commands.registerCommand('workgaga.preview', () => triggerEditorContentChange(true)),
  );
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(() => triggerEditorContentChange()));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((e) => handleActiveEditorChange(e)));
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (state.isPanelInit && e?.document && !state.disableEdit) {
        triggerEditorContentChange();
      }
    }),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      if (!state.isPanelInit || !state.panel) return;
      if (!state.disableScroll) {
        state.panel.webview.postMessage({ cmd: 'editor-scroll', data: e.visibleRanges[0].start.line });
      }
    }),
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}

const createExportProgressItem = () => {
  if (!state.exportProgressItem) {
    state.exportProgressItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  }
  return state.exportProgressItem;
};

const showExportProgress = (message: string, increment = 0) => {
  const item = createExportProgressItem();
  state.exportProgressValue = Math.min(100, Math.max(0, state.exportProgressValue + increment));
  item.text = `$(sync~spin) 导出中 ${state.exportProgressValue}%`;
  item.tooltip = message;
  item.show();
};

const completeExportProgress = (message: string) => {
  const item = createExportProgressItem();
  state.exportProgressValue = 100;
  item.text = '$(check) 导出完成 100%';
  item.tooltip = message;
  item.show();
  setTimeout(() => {
    state.exportProgressItem?.hide();
    state.exportProgressValue = 0;
  }, 2500);
};

const failExportProgress = () => {
  state.exportProgressItem?.hide();
  state.exportProgressValue = 0;
};

const getExportSourceName = () =>
  state.targetEditor?.document
    ? path.basename(state.targetEditor.document.fileName, path.extname(state.targetEditor.document.fileName))
    : 'workgaga-document';

const createPdfFromJpeg = (imageBuffer: Buffer, imageWidth: number, imageHeight: number) => {
  const pageWidth = Math.max(1, Math.round(imageWidth));
  const pageHeight = Math.max(1, Math.round(imageHeight));
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects: Buffer[] = [
    Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
    Buffer.from(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    ),
    Buffer.concat([
      Buffer.from(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBuffer.length} >>\nstream\n`,
      ),
      imageBuffer,
      Buffer.from('\nendstream\nendobj\n'),
    ]),
    Buffer.from(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`),
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets = objects.map((object) => {
    const offset = parts.reduce((sum, part) => sum + part.length, 0);
    parts.push(object);
    return offset;
  });
  const xrefOffset = parts.reduce((sum, part) => sum + part.length, 0);
  const xref = [`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`]
    .concat(offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`))
    .join('');
  parts.push(
    Buffer.from(`${xref}trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`),
  );
  return Buffer.concat(parts);
};

const selectExportDirectory = async (exportType: 'png' | 'pdf') => {
  showExportProgress('请选择导出目录...', 5);
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: '选择导出目录',
    title: `选择 ${exportType.toUpperCase()} 导出目录`,
  });
  const targetDir = selected?.[0];
  if (!targetDir) {
    failExportProgress();
    vscode.window.showWarningMessage('已取消导出。');
    return;
  }
  state.exportTargetDir = targetDir;
  state.panel?.webview.postMessage({ cmd: 'run-export', data: { exportType } });
};

/**
 * 获取当前文件的信息
 * @returns
 */
const getMarkdownFileInfo = () => {
  let editor = vscode.window.activeTextEditor;
  let doc = editor?.document;
  let text = '';
  let title = '';
  if (doc?.languageId !== 'markdown' && state.targetEditor?.document?.languageId === 'markdown') {
    editor = state.targetEditor;
    doc = state.targetEditor?.document;
  }
  if (doc?.languageId === 'markdown' && editor) {
    state.targetEditor = editor;
    text = doc.getText() || '';
    title = path.basename(doc.fileName) || '';
  }
  title = title
    ? `${vscode.l10n.t('Preview')} ${title} ${vscode.l10n.t('By')} workgaga`
    : `${vscode.l10n.t('UnSupported')} ${vscode.l10n.t('By')} workgaga`;
  const theme = state.theme ?? vscode.workspace.getConfiguration('workgaga').get('theme');
  return { mdInfo: { text, theme }, currentTitle: title };
};

/**
 * 初始化cherry预览窗口
 */
const initCherryPanel = () => {
  if (state.isPanelInit && state.panel) {
    state.panel.reveal(vscode.ViewColumn.Two);
    return;
  }
  const { mdInfo, currentTitle } = getMarkdownFileInfo();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? '';
  state.panel = vscode.window.createWebviewPanel('workgaga.preview', currentTitle, vscode.ViewColumn.Two, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [
      vscode.Uri.file(path.join(state.extPath, 'web-resources')),
      vscode.Uri.file(path.join(state.extPath, 'web-resources', 'dist')),
      vscode.Uri.file(workspaceFolder),
    ],
  });
  try {
    state.panel.webview.html = getWebviewContent(
      { ...mdInfo, vscodeLanguage: vscode.env.language },
      state.panel,
      state.extPath,
    );
  } catch (err) {
    vscode.window.showErrorMessage('Failed to initialize workgaga webview.');
    console.error(err);
  }
  state.panel.iconPath = vscode.Uri.file(path.join(state.extPath, 'favicon.ico'));
  state.isPanelInit = true;
  state.panel.onDidDispose(() => state.reset());
  initCherryPanelEvent();
};

const initCherryPanelEvent = () => {
  if (!state.panel) return;
  state.webviewMsgDisposable?.dispose();
  state.webviewMsgDisposable = state.panel.webview.onDidReceiveMessage(async (e) => {
    const { type, data } = e;
    switch (type) {
      case 'preview-scroll': {
        state.disableScroll = true;
        if (!state.targetEditor) return;
        const pos = new vscode.Position(data, 0);
        const range = new vscode.Range(pos, pos);
        state.targetEditor.revealRange(range, vscode.TextEditorRevealType.AtTop);
        if (state.scrollTimeout) clearTimeout(state.scrollTimeout);
        state.scrollTimeout = setTimeout(() => {
          state.disableScroll = false;
        }, 500);
        return;
      }
      case 'change-theme': {
        state.theme = data;
        vscode.workspace.getConfiguration('workgaga').update('theme', data, true);
        break;
      }
      case 'cherry-change': {
        if (!state.targetEditor) break;
        state.disableEdit = true;
        state.targetEditor.edit((editBuilder) => {
          const endNum = state.targetEditor!.document.lineCount + 1;
          const end = new vscode.Position(endNum, 0);
          editBuilder.replace(new vscode.Range(new vscode.Position(0, 0), end), data.markdown);
        });
        if (state.editTimeout) clearTimeout(state.editTimeout);
        state.editTimeout = setTimeout(() => {
          state.disableEdit = false;
        }, 500);
        break;
      }
      case 'tips':
        vscode.window.showInformationMessage(data, 'OK');
        break;
      case 'cherry-load-img':
        // 可扩展图片加载逻辑
        break;
      case 'upload-file': {
        try {
          const res = await uploadFileHandler(data);
          if (res.url) {
            state.panel?.webview.postMessage({ cmd: 'upload-file-callback', data: res });
          } else {
            vscode.window.showInformationMessage('上传不成功');
          }
        } catch (err) {
          vscode.window.showErrorMessage('上传失败');
          console.error(err);
        }
        break;
      }
      case 'open-url': {
        if (data === 'href-invalid') {
          vscode.window.showErrorMessage('link is not valid, please check it.');
          return;
        }
        if (/^(http|https):\/\//.test(data)) {
          vscode.env.openExternal(vscode.Uri.parse(data));
          return;
        }
        const decodedData = decodeURIComponent(data);
        if (path.isAbsolute(decodedData)) {
          const decodedDataPath = vscode.Uri.file(decodedData);
          vscode.commands.executeCommand('vscode.open', decodedDataPath, { preview: true });
          return;
        }
        if (data.startsWith('#')) return;
        if (!state.targetEditor) return;
        const uri = vscode.Uri.file(path.join(state.targetEditor.document.uri.fsPath, '..', data));
        vscode.commands.executeCommand('vscode.open', uri, { preview: true });
        break;
      }
      case 'export-start': {
        await selectExportDirectory(data.exportType);
        break;
      }
      case 'export-progress': {
        showExportProgress(data.message, data.increment);
        break;
      }
      case 'export-png': {
        if (data === 'export-fail') {
          failExportProgress();
          vscode.window.showErrorMessage('导出错误，请重新尝试');
          return;
        }
        const targetDir = state.exportTargetDir;
        if (!targetDir) {
          failExportProgress();
          vscode.window.showErrorMessage('导出目录未选择，请重新导出');
          return;
        }
        showExportProgress('正在写入导出文件...', 20);
        const targetUri = vscode.Uri.joinPath(targetDir, `${getExportSourceName()}-${Date.now()}.png`);
        try {
          const base64Data = data.dataUrl.replace(/^data:image\/png;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          await vscode.workspace.fs.writeFile(targetUri, buffer);
          completeExportProgress(`已导出到 ${targetUri.fsPath}`);
          vscode.window.showInformationMessage(`导出成功：${targetUri.fsPath}`);
        } catch (err) {
          failExportProgress();
          vscode.window.showErrorMessage('导出文件写入失败，请重新尝试');
          console.error(err);
        } finally {
          state.exportTargetDir = undefined;
        }
        break;
      }
      case 'export-pdf': {
        if (data === 'export-fail') {
          failExportProgress();
          vscode.window.showErrorMessage('导出错误，请重新尝试');
          return;
        }
        const targetDir = state.exportTargetDir;
        if (!targetDir) {
          failExportProgress();
          vscode.window.showErrorMessage('导出目录未选择，请重新导出');
          return;
        }
        showExportProgress('正在写入 PDF 文件...', 20);
        const targetUri = vscode.Uri.joinPath(targetDir, `${getExportSourceName()}-${Date.now()}.pdf`);
        try {
          const base64Data = data.dataUrl.replace(/^data:image\/jpeg;base64,/, '');
          const imageBuffer = Buffer.from(base64Data, 'base64');
          const pdfBuffer = createPdfFromJpeg(imageBuffer, data.width, data.height);
          await vscode.workspace.fs.writeFile(targetUri, pdfBuffer);
          completeExportProgress(`已导出到 ${targetUri.fsPath}`);
          vscode.window.showInformationMessage(`导出成功：${targetUri.fsPath}`);
        } catch (err) {
          failExportProgress();
          vscode.window.showErrorMessage('导出 PDF 写入失败，请重新尝试');
          console.error(err);
        } finally {
          state.exportTargetDir = undefined;
        }
        break;
      }
    }
  });
};

// handle active editor change
const handleActiveEditorChange = (e: vscode.TextEditor | undefined) => {
  const cherryUsage = vscode.workspace.getConfiguration('workgaga').get<'active' | 'only-manual'>('Usage');
  if (!e?.document || cherryUsage !== 'active') return;
  triggerEditorContentChange();
  if (e.document.languageId !== 'markdown') {
    state.panel?.webview.postMessage({ cmd: 'disable-edit', data: {} });
  } else {
    state.panel?.webview.postMessage({ cmd: 'enable-edit', data: {} });
  }
};

/**
 * 向预览区发送vscode编辑区内容变更的消息
 */
const triggerEditorContentChange = (focus = false) => {
  if (state.isPanelInit && state.panel) {
    const { mdInfo, currentTitle } = getMarkdownFileInfo();
    state.panel.title = currentTitle;
    state.panel.webview.postMessage({ cmd: 'editor-change', data: mdInfo });
    return;
  }
  if (vscode.window.activeTextEditor?.document?.languageId === 'markdown') {
    const cherryUsage = vscode.workspace.getConfiguration('workgaga').get<'active' | 'only-manual'>('Usage');
    if (cherryUsage === 'active' || focus) {
      initCherryPanel();
    }
  }
};
