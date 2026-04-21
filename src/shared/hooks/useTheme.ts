import React from "react";
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  type ThemeMode,
} from "../lib/theme";

export { clearStoredTheme, initializeTheme, type ThemeMode } from "../lib/theme";

export const useTheme = () => {
  const [theme, setThemeState] = React.useState<ThemeMode>(readStoredTheme);

  React.useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const setTheme = React.useCallback((next: ThemeMode) => setThemeState(next), []);
  const toggleTheme = React.useCallback(
    () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, setTheme, toggleTheme };
};
