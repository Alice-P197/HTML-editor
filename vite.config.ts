import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Electron 桌面壳构建：资源用相对路径，产物由 Electron 以 file:// 加载
const isElectronBuild = process.env.ELECTRON_BUILD === '1';

// Electron 构建后处理：去掉 index.html 中的 crossorigin 属性——
// file:// 下 module 脚本带 crossorigin 会被 CORS 拦截导致白屏
function electronPostBuildPlugin(): Plugin {
  return {
    name: 'electron-postbuild',
    apply: 'build',
    closeBundle() {
      const indexPath = path.resolve(import.meta.dirname, 'dist', 'client', 'index.html');
      if (!fs.existsSync(indexPath)) return;
      const html = fs.readFileSync(indexPath, 'utf-8');
      const fixed = html.replace(/\s+crossorigin/g, '');
      if (fixed !== html) {
        fs.writeFileSync(indexPath, fixed, 'utf-8');
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), ...(isElectronBuild ? [electronPostBuildPlugin()] : [])],
  base: isElectronBuild ? './' : '/',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist/client',
  },
  // 本地开发仅使用；生产构建不注入额外全局常量
  define: command === 'serve' ? {} : {},
}));
