import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { IDirectoryHandle, IEditorDoc, IFileHandle } from '@/data/editor-types';
import {
  DEFAULT_HTML,
  countStats,
  draftStore,
  formatHtml,
  hasFilePickerSupport,
  listWorkspaceHtmlFiles,
  mergeBodyInner,
  openHtmlFile,
  openViaInput,
  pickWorkspaceDir,
  readFileAsText,
  readWorkspaceFile,
  saveAsHtml,
  saveWithHandle,
} from '@/lib/html-editor';

// EXPORTS: IEditorCursor{line,col}, IEditorStats{chars,lines}, IUseEditorReturn, useEditor

export interface IEditorCursor {
  line: number;
  col: number;
}

export interface IEditorStats {
  chars: number;
  lines: number;
}

export interface IUseEditorReturn {
  doc: IEditorDoc;
  setSource: (v: string) => void;
  dirty: boolean;
  isEditing: boolean;
  setEditing: (v: boolean) => void;
  previewStale: boolean;
  refreshPreview: () => void;
  renderedHtml: string;
  cursor: IEditorCursor;
  setCursor: (c: IEditorCursor) => void;
  handleWysiwygChange: (bodyInner: string) => void;
  handleNew: () => void;
  handleOpen: () => void;
  handleSave: () => void;
  handleSaveAs: () => void;
  stats: IEditorStats;
  workspaceDir: IDirectoryHandle | null;
  workspaceFiles: string[];
  handlePickWorkspace: () => void;
  handleRefreshWorkspace: () => void;
  handleOpenFromWorkspace: (name: string) => void;
  hasPicker: boolean;
}

const INITIAL_DOC: IEditorDoc = { fileName: '未命名.html', source: DEFAULT_HTML };

/** 挂载前读取一次未保存草稿，作为初始文档（自动格式化排版） */
const initialDoc: IEditorDoc = (() => {
  const draft = draftStore.get();
  return draft ? { ...draft, source: formatHtml(draft.source) } : INITIAL_DOC;
})();

/** 编辑器文档的核心状态与打开 / 保存 / 双向同步逻辑 */
export function useEditor(): IUseEditorReturn {
  const [doc, setDoc] = useState<IEditorDoc>(initialDoc);
  const [dirty, setDirty] = useState(() => initialDoc.source !== INITIAL_DOC.source);
  const [isEditing, setIsEditing] = useState(true);
  const [previewStale, setPreviewStale] = useState(false);
  const [renderedHtml, setRenderedHtml] = useState(initialDoc.source);
  const [cursor, setCursor] = useState<IEditorCursor>({ line: 1, col: 1 });
  const [fileHandle, setFileHandle] = useState<IFileHandle | null>(null);
  const [workspaceDir, setWorkspaceDir] = useState<IDirectoryHandle | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);

  const sourceRef = useRef(initialDoc.source);
  const savedSourceRef = useRef(initialDoc.source);
  const wysiwygUpdating = useRef(false);
  const previewStaleRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const draftTimerRef = useRef<number | undefined>(undefined);

  const markPreviewStale = useCallback(() => {
    previewStaleRef.current = true;
    setPreviewStale(true);
  }, []);

  const clearPreviewStale = useCallback(() => {
    previewStaleRef.current = false;
    setPreviewStale(false);
  }, []);

  /** 统一入口：源码被修改（手写或 WYSIWYG 回写） */
  const commitSource = useCallback(
    (next: string) => {
      sourceRef.current = next;
      setDoc((prev) => ({ ...prev, source: next }));
      setDirty(true);
      if (wysiwygUpdating.current) {
        // WYSIWYG 回写：iframe 内就是最新内容，无需刷新
        wysiwygUpdating.current = false;
        return;
      }
      if (isEditing) {
        // 编辑模式下不打断正在编辑的画布，标记待刷新
        markPreviewStale();
        return;
      }
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        setRenderedHtml(next);
      }, 350);
    },
    [isEditing, markPreviewStale],
  );

  const setSource = useCallback(
    (v: string) => {
      commitSource(v);
    },
    [commitSource],
  );

  /** 预览内像 Word 一样编辑后，把 body 内容合并回源码 */
  const handleWysiwygChange = useCallback(
    (bodyInner: string) => {
      wysiwygUpdating.current = true;
      commitSource(mergeBodyInner(sourceRef.current, bodyInner));
    },
    [commitSource],
  );

  /** 切换编辑模式：进入时预览立即与源码对齐，退出时补刷未同步的改动 */
  const setEditing = useCallback(
    (v: boolean) => {
      window.clearTimeout(debounceRef.current);
      setIsEditing(v);
      if (v) {
        setRenderedHtml(sourceRef.current);
        clearPreviewStale();
      } else if (previewStaleRef.current) {
        setRenderedHtml(sourceRef.current);
        clearPreviewStale();
      }
    },
    [clearPreviewStale],
  );

  /** 手动刷新预览 */
  const refreshPreview = useCallback(() => {
    window.clearTimeout(debounceRef.current);
    setRenderedHtml(sourceRef.current);
    clearPreviewStale();
  }, [clearPreviewStale]);

  /** 打开 / 新建后统一装载文档（自动完成格式化排版） */
  const applyOpenedFile = useCallback(
    (source: string, fileName: string, handle: IFileHandle | null) => {
      const formatted = formatHtml(source);
      window.clearTimeout(debounceRef.current);
      setDoc({ fileName, source: formatted });
      sourceRef.current = formatted;
      savedSourceRef.current = formatted;
      setFileHandle(handle);
      setRenderedHtml(formatted);
      clearPreviewStale();
      wysiwygUpdating.current = false;
      setDirty(false);
    },
    [clearPreviewStale],
  );

  const handleNew = useCallback(() => {
    applyOpenedFile(DEFAULT_HTML, '未命名.html', null);
  }, [applyOpenedFile]);

  // ---- 工作区：左侧边栏的 HTML 文件列表 ----

  const loadWorkspaceFiles = useCallback(async (dir: IDirectoryHandle) => {
    try {
      const names = await listWorkspaceHtmlFiles(dir);
      setWorkspaceFiles(names);
    } catch {
      toast.error('读取工作区文件失败');
    }
  }, []);

  const handlePickWorkspace = useCallback(async () => {
    const dir = await pickWorkspaceDir();
    if (!dir) {
      toast.info('当前浏览器不支持选择文件夹，请使用 Chrome / Edge');
      return;
    }
    setWorkspaceDir(dir);
    await loadWorkspaceFiles(dir);
  }, [loadWorkspaceFiles]);

  const handleRefreshWorkspace = useCallback(() => {
    if (workspaceDir) void loadWorkspaceFiles(workspaceDir);
  }, [workspaceDir, loadWorkspaceFiles]);

  const handleOpenFromWorkspace = useCallback(
    async (name: string) => {
      if (!workspaceDir) return;
      try {
        const result = await readWorkspaceFile(workspaceDir, name);
        if (result) applyOpenedFile(result.doc.source, result.doc.fileName, result.handle);
        else toast.error(`无法打开 ${name}`);
      } catch {
        toast.error(`无法打开 ${name}`);
      }
    },
    [workspaceDir, applyOpenedFile],
  );

  const applyFile = useCallback(
    async (file: File) => {
      try {
        const source = await readFileAsText(file);
        applyOpenedFile(source, file.name, null);
      } catch {
        toast.error('读取文件失败，请重试');
      }
    },
    [applyOpenedFile],
  );

  const handleOpen = useCallback(async () => {
    if (!hasFilePickerSupport()) {
      openViaInput(applyFile);
      return;
    }
    try {
      const result = await openHtmlFile();
      if (result) applyOpenedFile(result.doc.source, result.doc.fileName, result.handle);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error('打开文件失败，请重试');
    }
  }, [applyOpenedFile, applyFile]);

  const handleSaveAs = useCallback(async () => {
    const current = sourceRef.current;
    try {
      const handle = await saveAsHtml(current, doc.fileName);
      if (handle) {
        setFileHandle(handle);
        setDoc((prev) => ({ ...prev, fileName: handle.name }));
        savedSourceRef.current = current;
        setDirty(false);
        draftStore.clear();
        toast.success('已保存');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(`保存失败：${String(err)}`);
    }
  }, [doc.fileName]);

  const handleSave = useCallback(async () => {
    const current = sourceRef.current;
    if (fileHandle) {
      try {
        await saveWithHandle(fileHandle, current);
        savedSourceRef.current = current;
        setDirty(false);
        draftStore.clear();
        toast.success('已保存');
      } catch (err) {
        toast.error(`保存失败：${String(err)}`);
      }
      return;
    }
    await handleSaveAs();
  }, [fileHandle, handleSaveAs]);

  // 有未保存修改时写入草稿（防抖批量落盘，避免高频按键下反复序列化大字符串卡顿）
  useEffect(() => {
    if (!dirty) return;
    window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => draftStore.set(doc), 500);
    return () => window.clearTimeout(draftTimerRef.current);
  }, [dirty, doc]);

  // Ctrl/Cmd+S 保存，Ctrl/Cmd+Shift+S 另存为
  const saveRef = useRef<() => void>(() => undefined);
  const saveAsRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    saveRef.current = handleSave;
    saveAsRef.current = handleSaveAs;
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (e.shiftKey) saveAsRef.current();
      else saveRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    doc,
    setSource,
    dirty,
    isEditing,
    setEditing,
    previewStale,
    refreshPreview,
    renderedHtml,
    cursor,
    setCursor,
    handleWysiwygChange,
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    stats: countStats(doc.source),
    workspaceDir,
    workspaceFiles,
    handlePickWorkspace,
    handleRefreshWorkspace,
    handleOpenFromWorkspace,
    hasPicker: hasFilePickerSupport(),
  };
}
