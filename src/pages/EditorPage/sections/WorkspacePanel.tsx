import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { FolderOpen, FileCode2, RefreshCw } from 'lucide-react';

interface WorkspacePanelProps {
  hasDirPicker: boolean;
  workspaceDirName: string | null;
  files: string[];
  activeFile: string;
  onPickWorkspace: () => void;
  onRefreshWorkspace: () => void;
  onOpenFile: (name: string) => void;
}

/** 工作区边栏：显示选定文件夹下的 HTML 文件，点击即可快速打开 / 切换；尺寸由外层拖拽面板控制 */
function WorkspacePanel({
  hasDirPicker,
  workspaceDirName,
  files,
  activeFile,
  onPickWorkspace,
  onRefreshWorkspace,
  onOpenFile,
}: WorkspacePanelProps) {
  return (
    <aside className="flex h-full w-full min-h-0 flex-col bg-card/60 backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-dashed px-3 py-1.5">
        <span className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">工作区</span>
        <div className="flex-1" />
        {workspaceDirName && (
          <button
            type="button"
            title="刷新文件列表"
            onClick={onRefreshWorkspace}
            className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent"
          >
            <RefreshCw className="size-3" />
          </button>
        )}
      </div>
      <div className="border-b border-dashed px-3 py-2">
        {workspaceDirName ? (
          <div className="truncate font-mono text-[11px] text-muted-foreground" title={workspaceDirName}>
            {workspaceDirName}
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            选择一个文件夹作为工作区，这里会列出其中的 HTML 文件，点击即可快速打开并保存。
          </p>
        )}
        <Button size="sm" variant="outline" className="mt-2 h-7 w-full text-xs" onClick={onPickWorkspace} disabled={!hasDirPicker}>
          <FolderOpen className="mr-1 size-3.5" />
          {workspaceDirName ? '切换文件夹' : '选择工作区文件夹'}
        </Button>
        {!hasDirPicker && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-warning">当前浏览器不支持选择文件夹，请使用 Chrome / Edge</p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {files.length > 0 ? (
          files.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onOpenFile(name)}
              title={`打开 ${name}`}
              className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left font-mono text-xs transition-colors hover:bg-accent ${
                name === activeFile ? 'bg-primary/10 text-primary' : 'text-foreground'
              }`}
            >
              <FileCode2 className="size-3.5 shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          ))
        ) : (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            {workspaceDirName ? '文件夹中没有 .html / .htm 文件' : '尚未选择文件夹'}
          </p>
        )}
      </div>
    </aside>
  );
}

export default memo(WorkspacePanel);
