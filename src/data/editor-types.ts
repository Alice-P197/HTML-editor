// EXPORTS: IEditorDoc{fileName,source}, IWritable{write,close}, IFileHandle{name,getFile,createWritable}, IOpenResult{doc,handle}, IDirectoryEntry{name,kind}, IDirectoryHandle{name,values,getFileHandle}, IFilePickerWindow, IFilePickerTypes

/** 当前正在编辑的文档 */
export interface IEditorDoc {
  /** 文件名（含扩展名） */
  fileName: string;
  /** 完整 HTML 源码 */
  source: string;
}

/** File System Access API 的 WritableStream 最小接口 */
export interface IWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

/** File System Access API 的文件句柄最小接口；Electron 桌面壳下为 { name, path } 形态 */
export interface IFileHandle {
  name: string;
  /** Electron 桌面壳：真实文件路径（浏览器环境无此字段） */
  path?: string;
  getFile(): Promise<File>;
  createWritable(): Promise<IWritable>;
}

/** 打开文件的返回结果 */
export interface IOpenResult {
  doc: IEditorDoc;
  handle: IFileHandle | null;
}

/** 工作区目录中的条目（文件 / 子目录） */
export interface IDirectoryEntry {
  name: string;
  kind: string;
}

/** File System Access API 的目录句柄最小接口；Electron 桌面壳下为 { name, path } 形态 */
export interface IDirectoryHandle {
  name: string;
  /** Electron 桌面壳：真实目录路径（浏览器环境无此字段） */
  path?: string;
  values(): AsyncIterableIterator<IDirectoryEntry>;
  getFileHandle(name: string): Promise<IFileHandle>;
}

/** 文件选择器文件类型描述 */
export interface IFilePickerTypes {
  description: string;
  accept: Record<string, string[]>;
}

/* ---------------- Electron 桌面壳 ---------------- */

/** Electron 版打开 / 读取结果 */
export interface IElectronOpenResult {
  name: string;
  path: string;
  content: string;
}

/** Electron 版保存结果 */
export interface IElectronSaveResult {
  name: string;
  path: string;
}

/** Electron 版工作区目录结果 */
export interface IElectronDirResult {
  name: string;
  path: string;
}

/** Electron 版工作区文件条目 */
export interface IElectronFileEntry {
  name: string;
  path: string;
}

/** Electron 桌面壳通过 preload 暴露的能力（window.htmlEditorAPI） */
export interface IElectronAPI {
  isElectron: boolean;
  openFile(): Promise<IElectronOpenResult | null>;
  readFile(filePath: string): Promise<IElectronOpenResult | null>;
  save(filePath: string, content: string): Promise<IElectronSaveResult | null>;
  saveAs(suggestedName: string, content: string): Promise<IElectronSaveResult | null>;
  pickDir(): Promise<IElectronDirResult | null>;
  listDir(dirPath: string): Promise<IElectronFileEntry[]>;
  detachPreview(html: string): Promise<boolean>;
  openPreviewInBrowser(html: string): Promise<boolean>;
  expandWindow(): Promise<boolean>;
}

/** 挂载了 File System Access API 的 Window 形态 */
export interface IFilePickerWindow {
  showOpenFilePicker?: (options?: { types?: IFilePickerTypes[]; multiple?: boolean }) => Promise<IFileHandle[]>;
  showSaveFilePicker?: (options?: { suggestedName?: string; types?: IFilePickerTypes[] }) => Promise<IFileHandle>;
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<IDirectoryHandle>;
  /** Electron 桌面壳通过 preload 暴露的桥接对象 */
  htmlEditorAPI?: IElectronAPI;
}
