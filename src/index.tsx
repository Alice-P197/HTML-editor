import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from '@/components/ErrorFallback';
import App from './app';
import { isElectron } from '@/lib/html-editor';
import './index.css';

// 桌面壳以 file:// 加载产物，BrowserRouter 会把完整文件路径当 pathname 导致 404；
// 桌面版用 HashRouter（#/ 路由），浏览器版保持 BrowserRouter
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      {isElectron() ? (
        <HashRouter>
          <App />
        </HashRouter>
      ) : (
        <BrowserRouter>
          <App />
        </BrowserRouter>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
