/**
 * HTML 编辑器 - Electron 预加载脚本
 * 通过 contextBridge 向渲染进程暴露安全的桌面能力
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('htmlEditorAPI', {
  isElectron: true,

  /* 文件操作 */
  openFile: () => ipcRenderer.invoke('file:open'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  save: (filePath, content) => ipcRenderer.invoke('file:save', filePath, content),
  saveAs: (suggestedName, content) => ipcRenderer.invoke('file:saveAs', suggestedName, content),

  /* 工作区 */
  pickDir: () => ipcRenderer.invoke('dir:pick'),
  listDir: (dirPath) => ipcRenderer.invoke('dir:list', dirPath),

  /* 预览 */
  detachPreview: (html) => ipcRenderer.invoke('preview:detach', html),
  openPreviewInBrowser: (html) => ipcRenderer.invoke('preview:openBrowser', html),

  /* 窗口 */
  expandWindow: () => ipcRenderer.invoke('window:expand'),
});
