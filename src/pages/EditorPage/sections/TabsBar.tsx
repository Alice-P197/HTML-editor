import { memo } from 'react';
import { X, FileCode2 } from 'lucide-react';
import type { IEditorTab } from '@/data/editor-types';

interface TabsBarProps {
  tabs: IEditorTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

/** 顶部标签栏：多文档并存，点击切换，未保存带圆点，可逐个关闭 */
function TabsBar({ tabs, activeId, onSelect, onClose }: TabsBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-dashed bg-card/40 px-2 backdrop-blur-xl">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.id)}
            className={`group flex max-w-48 cursor-pointer items-center gap-1.5 border-r border-dashed px-3 text-xs transition-colors ${
              active ? 'bg-card text-primary' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <FileCode2 className="size-3.5 shrink-0" />
            <span className="truncate font-mono">{tab.fileName}</span>
            {tab.dirty ? (
              <span title="未保存" className="size-1.5 shrink-0 rounded-full bg-warning" />
            ) : (
              <span className="size-1.5 shrink-0 rounded-full bg-success/70" />
            )}
            <button
              type="button"
              title="关闭标签"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 transition-colors hover:bg-accent hover:text-foreground group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default memo(TabsBar);
