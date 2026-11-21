import { useEffect, useDeferredValue, useMemo, useRef, type ChangeEvent, type KeyboardEvent, type WheelEvent } from 'react';
import hljs from 'highlight.js';
import { cursorPosition } from '@/lib/html-editor';
import type { IEditorCursor } from '../use-editor';

interface CodePaneProps {
  value: string;
  onChange: (v: string) => void;
  onCursorChange: (c: IEditorCursor) => void;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 左侧源码编辑区：行号 + 语法高亮，透明 textarea 覆盖其上保证原生编辑体验；长行自动折行不超出边界 */
export default function CodePane({ value, onChange, onCursorChange }: CodePaneProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  // 输入走实时 value；语法高亮与行号用延迟值追赶，避免每键全量解析阻塞打字
  const deferredValue = useDeferredValue(value);

  const highlighted = useMemo(() => {
    try {
      return hljs.highlight(deferredValue, { language: 'xml' }).value;
    } catch {
      return escapeHtml(deferredValue);
    }
  }, [deferredValue]);

  const lineNumbers = useMemo(() => {
    const count = Math.max(1, deferredValue.split('\n').length);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [deferredValue]);

  // 受控 textarea 在值更新后会丢失光标，这里在渲染后恢复
  useEffect(() => {
    const sel = selectionRef.current;
    const el = ref.current;
    if (sel && el && document.activeElement === el) {
      el.setSelectionRange(sel.start, sel.end);
      selectionRef.current = null;
    }
  }, [value]);

  // 透明 textarea 高度跟随内容，与高亮层 pre 对齐；垂直滚动统一由外层容器承担
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [deferredValue]);

  /** 外层滚动容器滚动时同步行号列与 textarea 内部位置（高亮层随容器自然滚动） */
  const syncScroll = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    if (gutterRef.current) gutterRef.current.scrollTop = sc.scrollTop;
    if (ref.current) ref.current.scrollTop = sc.scrollTop;
  };

  /** 滚轮落在 textarea 上时转发给外层可滚动容器，避免被表单控件吞掉导致无法上下滚动 */
  const handleWheel = (e: WheelEvent<HTMLTextAreaElement>) => {
    const sc = scrollRef.current;
    if (!sc) return;
    e.preventDefault();
    sc.scrollTop += e.deltaY;
  };

  const reportCursor = () => {
    const el = ref.current;
    if (!el) return;
    const pos = cursorPosition(el);
    onCursorChange({ line: pos.line, col: pos.col });
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    selectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
    onChange(el.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (e.shiftKey) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const indent = value.slice(lineStart, start);
      const remove = indent.startsWith('  ') ? 2 : indent.startsWith(' ') ? 1 : 0;
      if (remove > 0) {
        onChange(value.slice(0, lineStart) + value.slice(lineStart + remove));
        selectionRef.current = { start: Math.max(start - remove, lineStart), end: Math.max(start - remove, lineStart) };
      }
    } else {
      onChange(value.slice(0, start) + '  ' + value.slice(end));
      selectionRef.current = { start: start + 2, end: start + 2 };
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-card/60 backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-dashed px-3 py-1.5">
        <span className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">源码 · HTML</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="w-11 shrink-0 select-none overflow-hidden border-r border-dashed bg-muted/40 py-3 pr-2 text-right font-mono text-[13px] leading-relaxed text-muted-foreground"
        >
          {lineNumbers.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
        <div ref={scrollRef} onScroll={syncScroll} className="relative min-w-0 flex-1 overflow-auto">
          <pre
            ref={preRef}
            aria-hidden="true"
            className="m-0 whitespace-pre-wrap break-all p-3 font-mono text-[13px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
          <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onWheel={handleWheel}
            onSelect={reportCursor}
            onClick={reportCursor}
            onKeyUp={reportCursor}
            spellCheck={false}
            wrap="soft"
            placeholder="在此输入 HTML 源码…"
            aria-label="HTML 源码编辑器"
            className="absolute inset-x-0 top-0 w-full resize-none overflow-hidden whitespace-pre-wrap break-all bg-transparent p-3 font-mono text-[13px] leading-relaxed text-transparent caret-primary outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </div>
  );
}
