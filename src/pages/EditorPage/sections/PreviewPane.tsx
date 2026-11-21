import { memo, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Bold, ExternalLink, Italic, Maximize2, Minimize2, PanelRightOpen, RefreshCw, Underline } from 'lucide-react';
import type { IFilePickerWindow } from '@/data/editor-types';

interface PreviewPaneProps {
  html: string;
  isEditing: boolean;
  previewStale: boolean;
  onRefresh: () => void;
  onWysiwygChange: (bodyInner: string) => void;
}

interface IFormatAction {
  key: string;
  cmd: string;
  value?: string;
  title: string;
  icon?: ReactElement;
  swatch?: string;
}

/** 模块级辅助函数：切换 iframe 文档的编辑模式（绕开 React Compiler 对 ref 取值修改的检查） */
function setDesignMode(doc: HTMLDocument, on: boolean): void {
  doc.designMode = on ? 'on' : 'off';
}

/** 注入预览文档的编辑态样式：保证文本可选、输入光标（caret）清晰可见 */
const EDIT_CSS = `
  html, body { -webkit-user-select: text; user-select: text; }
  body { caret-color: #2563eb; outline: none; min-height: 100vh; }
  [contenteditable] { caret-color: #2563eb; }
`;

/** 把编辑态样式注入 iframe 文档（重复调用幂等） */
function injectEditCss(doc: HTMLDocument): void {
  let style = doc.getElementById('editor-edit-style') as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = 'editor-edit-style';
    doc.head?.appendChild(style);
  }
  style.textContent = EDIT_CSS;
}

/** 移除注入的编辑态样式 */
function removeEditCss(doc: HTMLDocument): void {
  const style = doc.getElementById('editor-edit-style');
  style?.remove();
}

/** 预览里的文字格式命令（作用于 iframe 内当前选中的文字） */
const FORMAT_ACTIONS: IFormatAction[] = [
  { key: 'bold', cmd: 'bold', title: '加粗', icon: <Bold className="size-3.5" /> },
  { key: 'italic', cmd: 'italic', title: '斜体', icon: <Italic className="size-3.5" /> },
  { key: 'underline', cmd: 'underline', title: '下划线', icon: <Underline className="size-3.5" /> },
  { key: 'color-ink', cmd: 'foreColor', value: '#1f2937', title: '文字颜色：墨黑', swatch: '#1f2937' },
  { key: 'color-red', cmd: 'foreColor', value: '#dc2626', title: '文字颜色：红', swatch: '#dc2626' },
  { key: 'color-blue', cmd: 'foreColor', value: '#2563eb', title: '文字颜色：蓝', swatch: '#2563eb' },
  { key: 'color-green', cmd: 'foreColor', value: '#059669', title: '文字颜色：绿', swatch: '#059669' },
  { key: 'hilite-yellow', cmd: 'hiliteColor', value: '#fde68a', title: '高亮：黄', swatch: '#fde68a' },
  { key: 'hilite-cyan', cmd: 'hiliteColor', value: '#a5f3fc', title: '高亮：青', swatch: '#a5f3fc' },
  { key: 'hilite-pink', cmd: 'hiliteColor', value: '#fbcfe8', title: '高亮：粉', swatch: '#fbcfe8' },
];

/** 右侧实时预览画布：iframe 渲染 + 编辑模式（designMode）下像 Word 一样直接编辑 */
function PreviewPane({ html, isEditing, previewStale, onRefresh, onWysiwygChange }: PreviewPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isEditingRef = useRef(isEditing);
  const onWysiwygChangeRef = useRef(onWysiwygChange);
  const flushTimerRef = useRef<number | undefined>(undefined);
  const pendingBodyRef = useRef<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const desktopApi = (typeof window !== 'undefined' ? (window as unknown as IFilePickerWindow).htmlEditorAPI : null) ?? null;
  const isDesktopApp = desktopApi?.isElectron === true;

  useEffect(() => {
    isEditingRef.current = isEditing;
    onWysiwygChangeRef.current = onWysiwygChange;
  });

  /** 编辑模式下拦截链接点击，避免跳出可编辑状态；站内锚点（#…）手动滚动跳转，保证目录可用 */
  const blockLinkNav = useCallback((e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;
    const link = target?.closest('a');
    if (!link) return;
    const href = link.getAttribute('href') ?? '';
    e.preventDefault();
    e.stopPropagation();
    if (href.startsWith('#') && href.length > 1) {
      const doc = target.ownerDocument;
      const el = doc.getElementById(href.slice(1));
      if (el) {
        const se = (doc.scrollingElement || doc.documentElement) as HTMLElement;
        se.scrollTop = Math.max(0, el.getBoundingClientRect().top + se.scrollTop - 10);
      }
    }
  }, []);

  /** 批量回写：把节流窗口内最后一次的 body 内容同步给源码层 */
  const flushPendingBody = useCallback(() => {
    window.clearTimeout(flushTimerRef.current);
    if (pendingBodyRef.current != null) {
      onWysiwygChangeRef.current(pendingBodyRef.current);
      pendingBodyRef.current = null;
    }
  }, []);

  /** 输入事件节流：高频按键下只缓存最新内容，定时批量合并回源码，避免逐键正则重排卡顿 */
  const handleBodyInput = useCallback(() => {
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) return;
    pendingBodyRef.current = body.innerHTML;
    window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(flushPendingBody, 120);
  }, [flushPendingBody]);

  /** 点击 iframe 时显式把焦点交给文档，保证输入光标出现在点击位置 */
  const ensureFocus = useCallback(() => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    frame.focus();
    doc.body?.focus();
  }, []);

  // 组件卸载时清掉未回写的定时器
  useEffect(() => () => window.clearTimeout(flushTimerRef.current), []);

  // 每次 iframe 重新加载（新文档）后恢复编辑状态并挂上监听；先移除再注册避免累积
  const handleLoad = () => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    doc.removeEventListener('click', blockLinkNav, true);
    doc.removeEventListener('mousedown', ensureFocus, true);
    doc.removeEventListener('focus', ensureFocus);
    doc.body?.removeEventListener('input', handleBodyInput, true);
    doc.addEventListener('click', blockLinkNav, true);
    doc.addEventListener('mousedown', ensureFocus, true);
    doc.addEventListener('focus', ensureFocus);
    doc.body?.addEventListener('input', handleBodyInput, true);
    if (isEditingRef.current) {
      injectEditCss(doc);
      setDesignMode(doc, true);
      frame.focus();
    } else {
      removeEditCss(doc);
      setDesignMode(doc, false);
    }
  };

  // 编辑模式开关切换时同步 designMode、链接拦截与编辑态样式
  useEffect(() => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    setDesignMode(doc, isEditing);
    if (isEditing) {
      injectEditCss(doc);
      doc.addEventListener('click', blockLinkNav, true);
      frame?.focus();
    } else {
      removeEditCss(doc);
      doc.removeEventListener('click', blockLinkNav, true);
    }
    return () => doc.removeEventListener('click', blockLinkNav, true);
  }, [isEditing, html, blockLinkNav]);

  /** 对预览中选中的文字执行格式命令 */
  const runCommand = (cmd: string, value?: string) => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    frame.focus();
    try {
      doc.execCommand(cmd, false, value);
    } catch {
      /* 忽略不支持的命令 */
    }
  };

  /** 预览分离为独立窗口（桌面版）；浏览器环境降级提示 */
  const handleDetach = () => {
    if (!isDesktopApp) {
      toast.info('预览分离需要桌面版（EXE）支持');
      return;
    }
    void desktopApi!.detachPreview(html).then((ok) => {
      if (!ok) toast.error('分离预览失败');
    });
  };

  /** 在系统默认浏览器中打开当前预览 */
  const handleOpenInBrowser = () => {
    if (!isDesktopApp) {
      toast.info('在系统浏览器打开需要桌面版（EXE）支持');
      return;
    }
    void desktopApi!.openPreviewInBrowser(html).then((ok) => {
      if (!ok) toast.error('打开浏览器失败');
    });
  };

  return (
    <div
      className={`flex min-w-0 flex-col bg-card/60 backdrop-blur-xl ${
        expanded ? 'fixed inset-0 z-50 shadow-2xl' : 'h-full'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-dashed px-3 py-1.5">
        <span className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">预览</span>
        {isEditing && (
          <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">编辑模式</span>
        )}
        {previewStale && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-warning">源码已更新，预览待刷新</span>
            <Button size="sm" variant="outline" className="h-5 px-1.5 text-[11px]" onClick={onRefresh}>
              <RefreshCw className="mr-0.5 size-3" />
              刷新
            </Button>
          </div>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={isDesktopApp ? '在系统默认浏览器中打开预览' : '在系统浏览器打开需要桌面版（EXE）'}
            onClick={handleOpenInBrowser}
            className="flex size-6 items-center justify-center rounded border border-input bg-transparent text-foreground transition-colors hover:bg-accent"
          >
            <ExternalLink className="size-3.5" />
          </button>
          <button
            type="button"
            title={isDesktopApp ? '把预览分离为独立窗口' : '预览分离需要桌面版（EXE）'}
            onClick={handleDetach}
            className="flex size-6 items-center justify-center rounded border border-input bg-transparent text-foreground transition-colors hover:bg-accent"
          >
            <PanelRightOpen className="size-3.5" />
          </button>
          <button
            type="button"
            title={expanded ? '还原预览大小' : '展开预览'}
            onClick={() => setExpanded((v) => !v)}
            className="flex size-6 items-center justify-center rounded border border-input bg-transparent text-foreground transition-colors hover:bg-accent"
          >
            {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>
      {isEditing && (
        <div className="flex items-center gap-1 border-b border-dashed px-2 py-1">
          <span className="mr-1 text-[10px] text-muted-foreground">先选中预览里的文字，再点格式</span>
          {FORMAT_ACTIONS.map((a) => (
            <button
              key={a.key}
              type="button"
              title={a.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand(a.cmd, a.value)}
              className="flex size-6 items-center justify-center rounded border border-input bg-transparent text-foreground transition-colors hover:bg-accent"
            >
              {a.swatch ? (
                <span className="size-3.5 rounded-sm border border-black/25" style={{ backgroundColor: a.swatch }} />
              ) : (
                a.icon
              )}
            </button>
          ))}
        </div>
      )}
      <div className={`relative min-h-0 flex-1 transition-shadow ${isEditing ? 'ring-2 ring-inset ring-primary/50' : ''}`}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={handleLoad}
          title="实时预览"
          className="h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}

export default memo(PreviewPane);
