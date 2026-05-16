export type LocaleCode = 'ja' | 'en';

const STORAGE_KEY = 'sumo-maker:locale';
const DEFAULT_LOCALE: LocaleCode = 'ja';

export const isLocaleCode = (value: string | null): value is LocaleCode =>
  value === 'ja' || value === 'en';

export const readStoredLocale = (): LocaleCode => {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isLocaleCode(stored) ? stored : DEFAULT_LOCALE;
};

export const applyLocale = (locale: LocaleCode): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
};

export const persistLocale = (locale: LocaleCode): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, locale);
};

export const clearStoredLocale = (): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  applyLocale(DEFAULT_LOCALE);
};

export const initializeLocale = (): void => {
  applyLocale(readStoredLocale());
};
