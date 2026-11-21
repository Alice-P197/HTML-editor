import type { IDirectoryHandle, IEditorDoc, IFileHandle, IFilePickerWindow, IOpenResult } from '@/data/editor-types';

// EXPORTS: DEFAULT_HTML, extractBodyInner, mergeBodyInner, cursorPosition, countStats, formatHtml, readFileAsText, hasFilePickerSupport, openHtmlFile, openViaInput, pickWorkspaceDir, listWorkspaceHtmlFiles, readWorkspaceFile, saveWithHandle, saveAsHtml, downloadHtml, draftStore

/** 新建文件时的默认模板 */
export const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的页面</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 640px;
      margin: 40px auto;
      padding: 0 20px;
      color: #333;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <h1>你好，世界</h1>
  <p>在左边编辑 HTML 源码，右侧实时预览。</p>
  <p>打开「编辑模式」后，可以直接在预览里像 Word 一样修改文字，改动会自动同步回源码。</p>
  <p>编辑完成后点击「保存」，内容会写回你打开的原始 HTML 文件。</p>
</body>
</html>`;

const BODY_OPEN_RE = /<body[^>]*>/i;
const BODY_FULL_RE = /(<body[^>]*>)[\s\S]*?(<\/body>)/i;
const BODY_INNER_RE = /<body[^>]*>([\s\S]*?)<\/body>/i;

/** 提取 <body> 标签内的 HTML 内容 */
export function extractBodyInner(html: string): string {
  const match = html.match(BODY_INNER_RE);
  return match ? match[1] : '';
}

/** 把新的 body 内容合并回原 HTML：有 <body> 则替换内部，无则包裹成完整文档 */
export function mergeBodyInner(html: string, bodyInner: string): string {
  if (BODY_OPEN_RE.test(html)) {
    return html.replace(BODY_FULL_RE, `$1${bodyInner}$2`);
  }
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的页面</title>
</head>
<body>
${bodyInner}
</body>
</html>`;
}

/** 计算 textarea 光标所在的行列（从 1 开始） */
export function cursorPosition(el: HTMLTextAreaElement): { line: number; col: number } {
  const pos = el.selectionStart ?? 0;
  const before = el.value.slice(0, pos);
  const lines = before.split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

/** 统计源码的字符数与行数 */
export function countStats(source: string): { chars: number; lines: number } {
  return { chars: source.length, lines: source.split('\n').length };
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
const BLOCK_RE = /<(script|style)[\s\S]*?<\/\1>/gi;
const BLOCK_PLACEHOLDER_RE = /^@BLOCK@(\d+)@BLOCK@$/;

/**
 * 把 HTML 源码格式化为带缩进的可读结构：
 * - 每个标签独立一行并按嵌套深度缩进（2 空格）
 * - 短文本与相邻标签合并成一行（如 <p>你好</p>）
 * - 长文本按单行宽度限制折行，避免超出源码区
 * - script / style 块整体保留，内部不重排（折行会破坏 JS / CSS 语义）
 * - 连续空白折叠为单个空格
 */
export function formatHtml(html: string): string {
  const blocks: string[] = [];
  const masked = html.replace(BLOCK_RE, (m) => {
    blocks.push(m);
    return `@BLOCK@${blocks.length - 1}@BLOCK@`;
  });

  const tokens = masked.split(/(<[^>]+>)/);
  const lines: string[] = [];
  const inlineTagRe = /^<[\w-]+[^>]*>$/;
  const closeTagRe = /^<\/[\w-]+>$/;
  const mergeLimit = 44;
  const wrapWidth = 88;
  let depth = 0;

  /** 把超宽文本按空格断点折成多行（无空格的长串按宽度硬切） */
  const wrapText = (text: string): string[] => {
    if (text.length <= wrapWidth) return [text];
    const parts: string[] = [];
    let rest = text;
    while (rest.length > wrapWidth) {
      let cut = rest.lastIndexOf(' ', wrapWidth);
      if (cut <= 0) cut = wrapWidth;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ /, '');
    }
    if (rest) parts.push(rest);
    return parts;
  };

  const pushLine = (text: string, atDepth?: number) => {
    lines.push('  '.repeat(Math.max(0, atDepth ?? depth)) + text);
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    const placeholder = token.trim().match(BLOCK_PLACEHOLDER_RE);
    if (placeholder) {
      const block = blocks[Number(placeholder[1])];
      const blockLines = block.split('\n');
      pushLine(blockLines[0]);
      for (let j = 1; j < blockLines.length; j++) {
        lines.push('  '.repeat(Math.max(0, depth)) + blockLines[j]);
      }
      continue;
    }

    if (!token.startsWith('<')) {
      const text = token.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const next = tokens[i + 1]?.trim();
      const lastLine = lines[lines.length - 1];
      const last = lastLine?.trim();
      const lastIsInlineOpen = last !== undefined && inlineTagRe.test(last) && !/\/>$/.test(last);
      if (lastIsInlineOpen && text.length <= mergeLimit) {
        // 开标签 + 短文本（后跟闭标签时一并合并）
        if (next && closeTagRe.test(next)) {
          lines[lines.length - 1] = lastLine + text + next;
          depth = Math.max(0, depth - 1);
          i += 1;
          continue;
        }
        lines[lines.length - 1] = lastLine + text;
        continue;
      }
      if (text.length <= mergeLimit && next && closeTagRe.test(next)) {
        pushLine(text + next);
        depth = Math.max(0, depth - 1);
        i += 1;
        continue;
      }
      for (const piece of wrapText(text)) {
        pushLine(piece);
      }
      continue;
    }

    if (/^<!--/.test(token)) {
      pushLine(token);
      continue;
    }

    if (/^<!DOCTYPE/i.test(token)) {
      lines.push(token.trim());
      continue;
    }

    const close = token.match(/^<\/([\w-]+)>/);
    if (close) {
      depth = Math.max(0, depth - 1);
      pushLine(token);
      continue;
    }

    const open = token.match(/^<([\w-]+)([\s\S]*?)>$/);
    if (open) {
      const name = open[1].toLowerCase();
      const isVoid = VOID_TAGS.has(name) || /\/>$/.test(token);
      pushLine(token);
      if (!isVoid) depth += 1;
      continue;
    }

    pushLine(token);
  }

  const formatted = lines.join('\n').trim();
  // 兜底保险：任何情况下都不得输出占位符，还原异常则放弃格式化，保护源码与文件不被污染
  if (formatted.includes('@BLOCK@')) return html.trim();
  return formatted;
}

/** 用 FileReader 以 UTF-8 读取文本文件 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file, 'UTF-8');
  });
}

const pickerWindow = () => window as unknown as IFilePickerWindow;
const HTML_TYPES = {
  description: 'HTML 文件',
  accept: { 'text/html': ['.html', '.htm'] },
};

/** 是否运行在 Electron 桌面壳里 */
export function isElectron(): boolean {
  return typeof pickerWindow().htmlEditorAPI?.isElectron === 'boolean' && pickerWindow().htmlEditorAPI.isElectron;
}

/** Electron 版文件句柄 / 目录句柄的最小形态（保存等路径操作走主进程 IPC，无需 stub 方法真正工作） */
function electronFileHandle(name: string, path: string): IFileHandle {
  return {
    name,
    path,
    getFile: async () => new File([], name),
    createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
  };
}

function electronDirHandle(name: string, path: string): IDirectoryHandle {
  return {
    name,
    path,
    values: async function* () {},
    getFileHandle: async () => electronFileHandle(name, path),
  };
}

/** 当前环境是否支持打开 / 保存文件（浏览器走 File System Access API，Electron 走主进程原生对话框） */
export function hasFilePickerSupport(): boolean {
  if (isElectron()) return true;
  return typeof pickerWindow().showOpenFilePicker === 'function';
}

/** 用系统文件选择器打开 HTML 文件；不支持时返回 null（由调用方降级为 input[type=file]） */
export async function openHtmlFile(): Promise<IOpenResult | null> {
  if (isElectron()) {
    const r = await pickerWindow().htmlEditorAPI!.openFile();
    if (!r) return null;
    return { doc: { fileName: r.name, source: r.content }, handle: electronFileHandle(r.name, r.path) };
  }
  if (!pickerWindow().showOpenFilePicker) return null;
  const [handle] = await pickerWindow().showOpenFilePicker({ types: [HTML_TYPES] });
  const file = await handle.getFile();
  const source = await readFileAsText(file);
  return { doc: { fileName: handle.name, source }, handle };
}

/** 降级打开：动态创建临时的 file input 让用户选择文件 */
export function openViaInput(onFile: (file: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.html,.htm,text/html';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener(
    'change',
    () => {
      const file = input.files?.[0];
      if (file) onFile(file);
      input.remove();
    },
    { once: true },
  );
  input.click();
}

/** 选择工作区文件夹；不支持时返回 null */
export async function pickWorkspaceDir(): Promise<IDirectoryHandle | null> {
  if (isElectron()) {
    const r = await pickerWindow().htmlEditorAPI!.pickDir();
    if (!r) return null;
    return electronDirHandle(r.name, r.path);
  }
  if (!pickerWindow().showDirectoryPicker) return null;
  return pickerWindow().showDirectoryPicker({ mode: 'readwrite' });
}

/** 列出工作区目录中的 .html / .htm 文件（按名称排序） */
export async function listWorkspaceHtmlFiles(dir: IDirectoryHandle): Promise<string[]> {
  if (isElectron() && dir.path) {
    const entries = await pickerWindow().htmlEditorAPI!.listDir(dir.path);
    const names = entries.map((e) => e.name);
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }
  const names: string[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && /\.html?$/i.test(entry.name)) names.push(entry.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

/** 读取工作区中的指定文件（Electron 下按真实路径读取） */
export async function readWorkspaceFile(dir: IDirectoryHandle, name: string): Promise<IOpenResult | null> {
  if (isElectron() && dir.path) {
    const entries = await pickerWindow().htmlEditorAPI!.listDir(dir.path);
    const entry = entries.find((e) => e.name === name);
    if (!entry) return null;
    const r = await pickerWindow().htmlEditorAPI!.readFile(entry.path);
    if (!r) return null;
    return { doc: { fileName: r.name, source: r.content }, handle: electronFileHandle(r.name, r.path) };
  }
  const handle = await dir.getFileHandle(name);
  const file = await handle.getFile();
  const source = await readFileAsText(file);
  return { doc: { fileName: handle.name, source }, handle };
}

/** 写入已持有的文件句柄（覆盖原文件内容；Electron 下直接写真实路径） */
export async function saveWithHandle(handle: IFileHandle, content: string): Promise<void> {
  if (isElectron() && handle.path) {
    const r = await pickerWindow().htmlEditorAPI!.save(handle.path, content);
    if (!r) throw new Error('保存失败');
    return;
  }
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/** 另存为：优先弹系统保存框写回真实文件；不支持时降级为下载文件，返回 null */
export async function saveAsHtml(content: string, suggestedName: string): Promise<IFileHandle | null> {
  if (isElectron()) {
    const r = await pickerWindow().htmlEditorAPI!.saveAs(suggestedName, content);
    if (!r) return null;
    return electronFileHandle(r.name, r.path);
  }
  if (pickerWindow().showSaveFilePicker) {
    return pickerWindow().showSaveFilePicker({ suggestedName, types: [HTML_TYPES] });
  }
  downloadHtml(content, suggestedName);
  return null;
}

/** 降级保存：把内容作为 .html 文件下载到本地 */
export function downloadHtml(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const NS = 'html-editor';

/** 未保存草稿的本地存储（带项目命名空间） */
export const draftStore = {
  get(): IEditorDoc | null {
    try {
      const raw = localStorage.getItem(`${NS}:draft`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as IEditorDoc;
      const source = String(parsed.source ?? '')
        // 自愈：旧版本格式化中途残留的占位符会污染草稿，直接清除
        .replace(/@BLOCK@\d+@BLOCK@/g, '');
      return { fileName: String(parsed.fileName ?? '未命名.html'), source };
    } catch {
      return null;
    }
  },
  set(doc: IEditorDoc): void {
    try {
      localStorage.setItem(`${NS}:draft`, JSON.stringify(doc));
    } catch {
      /* 隐私模式等场景静默降级 */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(`${NS}:draft`);
    } catch {
      /* 忽略 */
    }
  },
};
