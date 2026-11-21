/** 编辑器主题：定义、读取与应用 */

export interface IThemeOption {
  id: string;
  name: string;
  /** 主题预览色块（两种主色，左背景右强调） */
  swatches: [string, string];
}

export const THEMES: IThemeOption[] = [
  { id: 'paper', name: '纸感暖白', swatches: ['#f5efe3', '#f59e0b'] },
  { id: 'midnight', name: '暗夜', swatches: ['#171c26', '#f5a623'] },
  { id: 'forest', name: '森林', swatches: ['#eef4ec', '#3d8f5f'] },
  { id: 'ocean', name: '海洋', swatches: ['#eef4fb', '#2f7fe0'] },
  { id: 'graphite', name: '石墨', swatches: ['#f1f1f0', '#4a5568'] },
];

const THEME_KEY = 'html-editor:theme';

export function getSavedTheme(): string {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    /* 隐私模式等场景忽略 */
  }
  return 'paper';
}

/** 应用主题：写入 html[data-theme]，CSS 变量随之切换 */
export function applyTheme(id: string): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* 忽略 */
  }
}

// 模块加载即应用上次保存的主题，避免首帧闪烁
applyTheme(getSavedTheme());
