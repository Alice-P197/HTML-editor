import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { IDirectoryHandle, IEditorTab, IFileHandle, IOpenResult } from '@/data/editor-types';
import {
  DEFAULT_HTML,
  countStats,
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

// EXPORTS: IEditorCursor{line,col}, IEditorStats{chars,lines}, useEditor

export interface IEditorCursor {
  line: number;
  col: number;
}

export interface IEditorStats {
  chars: number;
  lines: number;
}

const DRAFT_KEY = 'html-editor:tabs-draft';
const LEGACY_DRAFT_KEY = 'html-editor:draft';

let seq = 0;
const nextId = () => `tab-${Date.now().toString(36)}-${seq++}`;

function makeTab(fileName: string, source: string, handle: IFileHandle | null, savedSource?: string): IEditorTab {
  const saved = savedSource ?? source;
  return { id: nextId(), fileName, source, handle, dirty: source !== saved, savedSource: saved };
}

/** 读取多标签草稿；兼容旧版单文档草稿 */
function restoreTabs(): IEditorTab[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { tabs?: { fileName: string; source: string }[] };
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        return parsed.tabs
          .filter((t) => typeof t.source === 'string')
          .map((t) => makeTab(t.fileName || '未命名.html', formatHtml(t.source), null));
      }
    }
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { fileName?: string; source?: string };
      if (typeof parsed.source === 'string' && parsed.source.trim()) {
        return [makeTab(parsed.fileName || '未命名.html', formatHtml(parsed.source), null)];
      }
    }
  } catch {
    /* 草稿损坏时回落到默认文档 */
  }
  return [makeTab('未命名.html', DEFAULT_HTML, null)];
}

/** 编辑器核心状态：多标签文档、打开 / 保存 / 双向同步逻辑 */
export function useEditor() {
  const [tabs, setTabs] = useState<IEditorTab[]>(restoreTabs);
  const [activeId, setActiveId] = useState<string>(() => tabs[0]?.id ?? '');
  const [isEditing, setIsEditing] = useState(true);
  const [cursor, setCursor] = useState<IEditorCursor>({ line: 1, col: 1 });
  const [workspaceDir, setWorkspaceDir] = useState<IDirectoryHandle | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);

  // 每个标签最近一次已刷新到预览的源码；未命中时预览跟随当前源码
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  const [staleMap, setStaleMap] = useState<Record<string, boolean>>({});

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const wysiwygUpdating = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const draftTimerRef = useRef<number | undefined>(undefined);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeId) ?? tabs[0],
    [tabs, activeId],
  );

  const patchTab = useCallback((id: string, patch: Partial<IEditorTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  /** 统一入口：某标签源码被修改（手写或 WYSIWYG 回写） */
  const commitSource = useCallback(
    (next: string, targetId?: string) => {
      const id = targetId ?? activeRef.current;
      if (!id) return;
      const prev = tabsRef.current.find((t) => t.id === id);
      if (!prev) return;
      const dirty = next !== prev.savedSource;

      if (wysiwygUpdating.current) {
        // WYSIWYG 回写：iframe 内就是最新内容，预览无需再刷
        wysiwygUpdating.current = false;
        patchTab(id, { source: next, dirty });
        return;
      }

      patchTab(id, { source: next, dirty });

      if (isEditing) {
        // 编辑模式下不打断正在编辑的画布，标记待刷新
        setStaleMap((m) => ({ ...m, [id]: true }));
        return;
      }
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        setPreviewMap((m) => ({ ...m, [id]: next }));
        setStaleMap((m) => ({ ...m, [id]: false }));
      }, 350);
    },
    [isEditing, patchTab],
  );

  const setSource = useCallback((v: string) => commitSource(v), [commitSource]);

  /** 预览内像 Word 一样编辑后，把 body 内容合并回当前标签源码 */
  const handleWysiwygChange = useCallback(
    (bodyInner: string) => {
      const id = activeRef.current;
      const prev = tabsRef.current.find((t) => t.id === id);
      if (!prev) return;
      wysiwygUpdating.current = true;
      commitSource(mergeBodyInner(prev.source, bodyInner), id);
    },
    [commitSource],
  );

  /** 切换编辑模式：进入时预览立即与源码对齐，退出时补刷未同步的改动 */
  const setEditing = useCallback(
    (v: boolean) => {
      window.clearTimeout(debounceRef.current);
      setIsEditing(v);
      const id = activeRef.current;
      const prev = tabsRef.current.find((t) => t.id === id);
      if (!prev) return;
      if (v) {
        setPreviewMap((m) => ({ ...m, [id]: prev.source }));
        setStaleMap((m) => ({ ...m, [id]: false }));
      } else {
        setPreviewMap((m) => ({ ...m, [id]: prev.source }));
        setStaleMap((m) => ({ ...m, [id]: false }));
      }
    },
    [],
  );

  /** 手动刷新当前标签预览 */
  const refreshPreview = useCallback(() => {
    window.clearTimeout(debounceRef.current);
    const id = activeRef.current;
    const prev = tabsRef.current.find((t) => t.id === id);
    if (!prev) return;
    setPreviewMap((m) => ({ ...m, [id]: prev.source }));
    setStaleMap((m) => ({ ...m, [id]: false }));
  }, []);

  /** 打开 / 新建后统一装载文档（自动格式化排版），已存在同文件则直接激活 */
  const upsertOpened = useCallback(
    (source: string, fileName: string, handle: IFileHandle | null) => {
      const formatted = formatHtml(source);
      const key = handle?.path || fileName;
      const existing = tabsRef.current.find((t) => (t.handle?.path || t.fileName) === key);
      if (existing) {
        setActiveId(existing.id);
        setPreviewMap((m) => ({ ...m, [existing.id]: existing.source }));
        setStaleMap((m) => ({ ...m, [existing.id]: false }));
        return;
      }
      const tab = makeTab(fileName, formatted, handle);
      setTabs((prev) => [...prev, tab]);
      setActiveId(tab.id);
      setPreviewMap((m) => ({ ...m, [tab.id]: formatted }));
      setStaleMap((m) => ({ ...m, [tab.id]: false }));
    },
    [],
  );

  const handleNew = useCallback(() => {
    const tab = makeTab('未命名.html', DEFAULT_HTML, null);
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
    setPreviewMap((m) => ({ ...m, [tab.id]: DEFAULT_HTML }));
    setStaleMap((m) => ({ ...m, [tab.id]: false }));
  }, []);

  const activateTab = useCallback((id: string) => {
    const prev = tabsRef.current.find((t) => t.id === id);
    if (!prev) return;
    setActiveId(id);
    setPreviewMap((m) => ({ ...m, [id]: prev.source }));
    setStaleMap((m) => ({ ...m, [id]: false }));
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const target = tabsRef.current.find((t) => t.id === id);
      if (!target) return;
      if (target.dirty && !window.confirm(`「${target.fileName}」有未保存的修改，确定关闭吗？`)) return;

      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const blank = makeTab('未命名.html', DEFAULT_HTML, null);
          setActiveId(blank.id);
          setPreviewMap((m) => ({ ...m, [blank.id]: DEFAULT_HTML }));
          return [blank];
        }
        if (id === activeRef.current) {
          const fallback = next[Math.max(0, idx - 1)] ?? next[0];
          setActiveId(fallback.id);
          setPreviewMap((m) => ({ ...m, [fallback.id]: fallback.source }));
        }
        return next;
      });
    },
    [],
  );

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
        if (result) upsertOpened(result.doc.source, result.doc.fileName, result.handle);
        else toast.error(`无法打开 ${name}`);
      } catch {
        toast.error(`无法打开 ${name}`);
      }
    },
    [workspaceDir, upsertOpened],
  );

  const applyFile = useCallback(
    async (file: File) => {
      try {
        const source = await readFileAsText(file);
        upsertOpened(source, file.name, null);
      } catch {
        toast.error('读取文件失败，请重试');
      }
    },
    [upsertOpened],
  );

  const handleOpen = useCallback(async () => {
    if (!hasFilePickerSupport()) {
      openViaInput(applyFile);
      return;
    }
    try {
      const result = await openHtmlFile();
      if (result) upsertOpened(result.doc.source, result.doc.fileName, result.handle);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error('打开文件失败，请重试');
    }
  }, [upsertOpened, applyFile]);

  const persistDraft = useCallback((list: IEditorTab[]) => {
    try {
      const payload = { tabs: list.map((t) => ({ fileName: t.fileName, source: t.source })) };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    } catch {
      /* 隐私模式等场景静默降级 */
    }
  }, []);

  const handleSaveAs = useCallback(async () => {
    const id = activeRef.current;
    const prev = tabsRef.current.find((t) => t.id === id);
    if (!prev) return;
    try {
      const handle = await saveAsHtml(prev.source, prev.fileName);
      if (handle) {
        patchTab(id, { handle, fileName: handle.name, savedSource: prev.source, dirty: false });
        persistDraft(tabsRef.current);
        toast.success('已保存');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(`保存失败：${String(err)}`);
    }
  }, [patchTab, persistDraft]);

  const handleSave = useCallback(async () => {
    const id = activeRef.current;
    const prev = tabsRef.current.find((t) => t.id === id);
    if (!prev) return;
    if (prev.handle) {
      try {
        await saveWithHandle(prev.handle, prev.source);
        patchTab(id, { savedSource: prev.source, dirty: false });
        persistDraft(tabsRef.current);
        toast.success('已保存');
      } catch (err) {
        toast.error(`保存失败：${String(err)}`);
      }
      return;
    }
    await handleSaveAs();
  }, [patchTab, persistDraft, handleSaveAs]);

  // 有未保存修改时写入草稿（防抖批量落盘，避免高频按键下反复序列化大字符串卡顿）
  useEffect(() => {
    window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => persistDraft(tabs), 500);
    return () => window.clearTimeout(draftTimerRef.current);
  }, [tabs, persistDraft]);

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

  const renderedHtml = activeTab ? (previewMap[activeTab.id] ?? activeTab.source) : DEFAULT_HTML;
  const previewStale = activeTab ? Boolean(staleMap[activeTab.id]) : false;
  const stats = activeTab ? countStats(activeTab.source) : { chars: 0, lines: 0 };

  return {
    tabs,
    activeTab,
    activeId,
    setActiveId: activateTab,
    closeTab,
    setSource,
    dirty: activeTab?.dirty ?? false,
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
    stats,
    workspaceDir,
    workspaceFiles,
    handlePickWorkspace,
    handleRefreshWorkspace,
    handleOpenFromWorkspace,
    hasPicker: hasFilePickerSupport(),
  };
}
