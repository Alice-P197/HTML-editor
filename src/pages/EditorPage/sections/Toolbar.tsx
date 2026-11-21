import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { FileDown, FilePlus, FolderOpen, Palette, Pencil, Save } from 'lucide-react';
import { applyTheme, getSavedTheme, THEMES } from '@/lib/theme';

interface ToolbarProps {
  isEditing: boolean;
  onToggleEditing: (v: boolean) => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

/** 顶部工具栏：文件操作 + 主题切换 + 编辑模式开关 */
function Toolbar({ isEditing, onToggleEditing, onNew, onOpen, onSave, onSaveAs }: ToolbarProps) {
  const [theme, setTheme] = useState(getSavedTheme());

  const pickTheme = (id: string) => {
    setTheme(id);
    applyTheme(id);
  };

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 bg-card/60 px-3 backdrop-blur-xl">
      <span className="mr-1 font-mono text-sm font-bold text-primary">&lt;html /&gt;</span>
      <span className="text-sm font-medium text-foreground">HTML 编辑器</span>
      <Separator orientation="vertical" className="mx-2 h-5" />
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onNew} title="新建文档">
        <FilePlus className="mr-1 size-4" />
        新建
      </Button>
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onOpen} title="打开本地 HTML 文件">
        <FolderOpen className="mr-1 size-4" />
        打开
      </Button>
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onSave} title="保存（Ctrl+S）">
        <Save className="mr-1 size-4" />
        保存
      </Button>
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onSaveAs} title="另存为（Ctrl+Shift+S）">
        <FileDown className="mr-1 size-4" />
        另存为
      </Button>
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" title="切换主题配色">
            <Palette className="size-4" />
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-black/20"
              style={{
                background: `linear-gradient(135deg, ${current.swatches[0]} 50%, ${current.swatches[1]} 50%)`,
              }}
            />
            <span className="max-w-16 truncate text-xs">{current.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuRadioGroup value={theme} onValueChange={pickTheme}>
            {THEMES.map((t) => (
              <DropdownMenuRadioItem key={t.id} value={t.id} className="gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                  style={{ background: `linear-gradient(135deg, ${t.swatches[0]} 50%, ${t.swatches[1]} 50%)` }}
                />
                {t.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Toggle
        pressed={isEditing}
        onPressedChange={onToggleEditing}
        aria-label="切换编辑模式"
        title="在预览里像 Word 一样直接编辑文字，改动自动同步回源码"
        className="gap-1 text-xs"
      >
        <Pencil className="size-3.5" />
        编辑模式
      </Toggle>
    </header>
  );
}

export default memo(Toolbar);
