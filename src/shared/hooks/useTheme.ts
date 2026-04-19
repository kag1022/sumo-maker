import React from "react";

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "sumo-maker:theme";
const DEFAULT_THEME: ThemeMode = "dark";

const readStoredTheme = (): ThemeMode => {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
};

const applyTheme = (theme: ThemeMode) => {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
};

export const initializeTheme = () => {
  applyTheme(readStoredTheme());
};

export const useTheme = () => {
  const [theme, setThemeState] = React.useState<ThemeMode>(readStoredTheme);

  React.useEffect(() => {
    applyTheme(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme]);

  const setTheme = React.useCallback((next: ThemeMode) => setThemeState(next), []);
  const toggleTheme = React.useCallback(
    () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, setTheme, toggleTheme };
};
