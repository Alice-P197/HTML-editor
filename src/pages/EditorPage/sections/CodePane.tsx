import { useEffect, useRef } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, indentWithTab } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { IEditorCursor } from '../use-editor';

interface CodePaneProps {
  value: string;
  onChange: (v: string) => void;
  onCursorChange: (c: IEditorCursor) => void;
}

/** 语法高亮配色，复用全局主题变量，随五套主题切换 */
const highlightStyle = HighlightStyle.define([
  { tag: t.comment, color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: t.tagName, color: 'var(--hl-tag)', fontWeight: '600' },
  { tag: t.attributeName, color: 'var(--hl-attr)' },
  { tag: t.attributeValue, color: 'var(--hl-string)' },
  { tag: t.string, color: 'var(--hl-string)' },
  { tag: t.keyword, color: 'var(--hl-keyword)' },
  { tag: t.propertyName, color: 'var(--hl-attr)' },
  { tag: t.className, color: 'var(--hl-string)' },
  { tag: t.literal, color: 'var(--hl-keyword)' },
  { tag: t.number, color: 'var(--hl-keyword)' },
]);

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    height: '100%',
    fontSize: '13px',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: '1.75',
  },
  '.cm-content': {
    padding: '12px 12px 48px',
    caretColor: 'var(--primary)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    border: 'none',
    paddingRight: '10px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--muted) 60%, transparent)' },
  '.cm-activeLineGutter': { color: 'var(--foreground)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--primary) 18%, transparent)',
  },
});

/** 左侧源码编辑区：CodeMirror 6 内核，行号 / HTML 高亮 / 括号匹配 / 撤销重做 / Tab 缩进 */
export default function CodePane({ value, onChange, onCursorChange }: CodePaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursorChange);
  onChangeRef.current = onChange;
  onCursorRef.current = onCursorChange;

  // 编辑器只挂载一次；后续外部值变化走下面的同步 effect
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reportCursor = (update: ViewUpdate) => {
      const pos = update.state.selection.main.head;
      const before = update.state.doc.sliceString(0, pos);
      const lines = before.split('\n');
      onCursorRef.current({ line: lines.length, col: lines[lines.length - 1].length + 1 });
    };

    const extensions: Extension = [
      lineNumbers(),
      history(),
      drawSelection(),
      keymap.of([...defaultKeymap, indentWithTab]),
      bracketMatching(),
      html(),
      syntaxHighlighting(highlightStyle),
      highlightActiveLine(),
      editorTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        if (update.selectionSet || update.docChanged) reportCursor(update);
      }),
    ];

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 仅以首次传入值初始化；value 同步由专门 effect 负责
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部值变化（切换标签 / 打开文件 / WYSIWYG 回写）时同步进编辑器，避免打断当前输入
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-card/60 backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-dashed px-3 py-1.5">
        <span className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">源码 · HTML</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div ref={hostRef} className="h-full" />
      </div>
    </div>
  );
}
