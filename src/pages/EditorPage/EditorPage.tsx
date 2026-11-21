import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { useEditor } from './use-editor';
import CodePane from './sections/CodePane';
import PreviewPane from './sections/PreviewPane';
import StatusBar from './sections/StatusBar';
import Toolbar from './sections/Toolbar';
import WorkspacePanel from './sections/WorkspacePanel';
import TabsBar from './sections/TabsBar';

/** 视口宽度 ≥1024px 时为桌面端（三栏横排），否则为窄屏（纵向堆叠） */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

/** HTML 编辑器主页：工作区 + 源码 + 预览，三栏宽度可拖拽调整，支持多标签与多主题配色 */
export default function EditorPage() {
  const editor = useEditor();
  const isDesktop = useIsDesktop();
  const active = editor.activeTab;

  const workspacePanel = (
    <WorkspacePanel
      hasDirPicker={editor.hasPicker}
      workspaceDirName={editor.workspaceDir?.name ?? null}
      files={editor.workspaceFiles}
      activeFile={active?.fileName ?? ''}
      onPickWorkspace={editor.handlePickWorkspace}
      onRefreshWorkspace={editor.handleRefreshWorkspace}
      onOpenFile={editor.handleOpenFromWorkspace}
    />
  );

  const codePane = (
    <CodePane
      value={active?.source ?? ''}
      onChange={editor.setSource}
      onCursorChange={editor.setCursor}
    />
  );

  const previewPane = (
    <PreviewPane
      html={editor.renderedHtml}
      isEditing={editor.isEditing}
      previewStale={editor.previewStale}
      onRefresh={editor.refreshPreview}
      onWysiwygChange={editor.handleWysiwygChange}
    />
  );

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-gradient-to-br from-background via-card to-secondary text-foreground">
      {/* 背景装饰色块，为毛玻璃提供层次，颜色随主题 */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 size-96 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-0 size-[28rem] rounded-full bg-info/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/3 top-1/4 size-72 rounded-full bg-success/10 blur-3xl" />

      <div className="relative z-10 flex h-screen flex-col">
        <Toolbar
          isEditing={editor.isEditing}
          onToggleEditing={editor.setEditing}
          onNew={editor.handleNew}
          onOpen={editor.handleOpen}
          onSave={editor.handleSave}
          onSaveAs={editor.handleSaveAs}
        />
        <TabsBar
          tabs={editor.tabs}
          activeId={editor.activeId}
          onSelect={editor.setActiveId}
          onClose={editor.closeTab}
        />
        {isDesktop ? (
          <ResizablePanelGroup direction="horizontal" autoSaveId="html-editor:layout" className="min-h-0 flex-1">
            <ResizablePanel defaultSize={16} minSize={10} maxSize={30}>
              {workspacePanel}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={44} minSize={22}>
              {codePane}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={22}>
              {previewPane}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <ResizablePanelGroup direction="vertical" autoSaveId="html-editor:layout-mobile" className="min-h-0 flex-1">
            <ResizablePanel defaultSize={26} minSize={12} maxSize={50}>
              {workspacePanel}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={42} minSize={24}>
              {codePane}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={32} minSize={24}>
              {previewPane}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
        <StatusBar
          fileName={active?.fileName ?? ''}
          dirty={editor.dirty}
          cursor={editor.cursor}
          isEditing={editor.isEditing}
          stats={editor.stats}
        />
        <Toaster position="bottom-right" />
      </div>
    </div>
  );
}
