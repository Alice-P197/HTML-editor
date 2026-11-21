/**
 * HTML 编辑器 - Electron 桌面壳主进程
 * 负责：主窗口、文件打开/保存（原生对话框）、工作区目录、预览分离窗口、系统浏览器打开预览
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 便携版：用户数据（主题/布局/草稿等）跟随程序所在目录，便于整体携带
if (app.isPackaged) {
  try {
    app.setPath('userData', path.join(path.dirname(process.execPath), '.data'));
  } catch {
    /* 忽略：异常时回退默认用户数据目录 */
  }
}

let mainWindow = null;
let splashWindow = null;

/** 关闭启动画面（幂等） */
function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
  splashWindow = null;
}

/** 启动画面：无边框透明小窗，主窗口就绪后自动关闭 */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 280,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    center: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  // 兜底：主窗口迟迟不就绪时也关闭启动画面
  setTimeout(closeSplash, 4000);
}

function createWindow() {
  const winIcon = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#f8f6f2',
    title: 'HTML 编辑器',
    icon: fs.existsSync(winIcon) ? winIcon : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    closeSplash();
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'client', 'index.html'));
  } else {
    // 开发模式：加载本地 dev server（npm run dev -- --port 32123）
    mainWindow.loadURL(process.env.VITE_DEV_URL || 'http://localhost:32123/');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createSplash();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------- 预览临时文件 ---------------- */

let previewSeq = 0;
/** 把预览 HTML 写入临时文件，返回路径 */
function writePreviewTemp(html) {
  const name = `html-editor-preview-${Date.now()}-${previewSeq++}.html`;
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, html, 'utf-8');
  return p;
}

function cleanupTemp(p) {
  try {
    fs.unlinkSync(p);
  } catch {
    /* 忽略清理失败 */
  }
}

/* ---------------- 文件 IPC ---------------- */

/** 打开 HTML 文件（原生对话框） */
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: '打开 HTML 文件',
    filters: [{ name: 'HTML 文件', extensions: ['html', 'htm'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const content = fs.readFileSync(p, 'utf-8');
  return { name: path.basename(p), path: p, content };
});

/** 读取指定路径文件（工作区点击打开） */
ipcMain.handle('file:read', async (_e, filePath) => {
  if (!filePath) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { name: path.basename(filePath), path: filePath, content };
  } catch {
    return null;
  }
});

/** 保存到已知路径 */
ipcMain.handle('file:save', async (_e, filePath, content) => {
  if (!filePath) return null;
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { name: path.basename(filePath), path: filePath };
  } catch (err) {
    dialog.showErrorBox('保存失败', String(err && err.message));
    return null;
  }
});

/** 另存为（原生对话框） */
ipcMain.handle('file:saveAs', async (_e, suggestedName, content) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: '另存为 HTML 文件',
    defaultPath: suggestedName || '未命名.html',
    filters: [{ name: 'HTML 文件', extensions: ['html', 'htm'] }],
  });
  if (r.canceled || !r.filePath) return null;
  const p = r.filePath;
  try {
    fs.writeFileSync(p, content, 'utf-8');
    return { name: path.basename(p), path: p };
  } catch (err) {
    dialog.showErrorBox('保存失败', String(err && err.message));
    return null;
  }
});

/** 选择工作区文件夹 */
ipcMain.handle('dir:pick', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: '选择工作区文件夹',
    properties: ['openDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  return { name: path.basename(p), path: p };
});

/** 列出文件夹下的 HTML 文件 */
ipcMain.handle('dir:list', async (_e, dirPath) => {
  if (!dirPath) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((en) => en.isFile() && /\.html?$/i.test(en.name))
      .map((en) => ({ name: en.name, path: path.join(dirPath, en.name) }));
  } catch {
    return [];
  }
});

/* ---------------- 预览：分离 / 系统浏览器打开 ---------------- */

/** 预览分离为独立窗口 */
ipcMain.handle('preview:detach', async (_e, html) => {
  const tmp = writePreviewTemp(html);
  const win = new BrowserWindow({
    width: 980,
    height: 860,
    title: 'HTML 预览（独立窗口）',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(tmp);
  win.on('closed', () => cleanupTemp(tmp));
  return true;
});

/** 在系统默认浏览器中打开预览 */
ipcMain.handle('preview:openBrowser', async (_e, html) => {
  const tmp = writePreviewTemp(html);
  try {
    await shell.openPath(tmp);
    // 延迟清理，避免浏览器还在读取时删除
    setTimeout(() => cleanupTemp(tmp), 30000);
    return true;
  } catch {
    return false;
  }
});

/** 主窗口最大化 / 还原切换 */
ipcMain.handle('window:expand', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});
