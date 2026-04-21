export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'sumo-maker:theme';
const DEFAULT_THEME: ThemeMode = 'dark';

export const readStoredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
};

export const applyTheme = (theme: ThemeMode): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
};

export const persistTheme = (theme: ThemeMode): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, theme);
};

export const clearStoredTheme = (): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  applyTheme(DEFAULT_THEME);
};

export const initializeTheme = (): void => {
  applyTheme(readStoredTheme());
};
