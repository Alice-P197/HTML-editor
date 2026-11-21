import type { IEditorCursor, IEditorStats } from '../use-editor';

interface StatusBarProps {
  fileName: string;
  dirty: boolean;
  cursor: IEditorCursor;
  isEditing: boolean;
  stats: IEditorStats;
}

/** 底部状态栏：文件名、保存状态、光标位置、字数统计 */
export default function StatusBar({ fileName, dirty, cursor, isEditing, stats }: StatusBarProps) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border/60 bg-card/60 px-3 text-[11px] text-muted-foreground backdrop-blur-xl">
      <span className="max-w-48 truncate font-mono">{fileName}</span>
      {dirty ? (
        <span className="flex items-center gap-1 font-medium text-warning">
          <span className="size-1.5 rounded-full bg-warning" />
          未保存
        </span>
      ) : (
        <span className="flex items-center gap-1 font-medium text-success">
          <span className="size-1.5 rounded-full bg-success" />
          已保存
        </span>
      )}
      <div className="flex-1" />
      <span className="font-mono">
        {stats.chars} 字符 · {stats.lines} 行
      </span>
      <span className="font-mono">
        行 {cursor.line}，列 {cursor.col}
      </span>
      <span>UTF-8</span>
      <span>{isEditing ? '编辑模式：开' : '编辑模式：关'}</span>
    </footer>
  );
}
