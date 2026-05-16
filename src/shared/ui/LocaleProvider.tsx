import React from "react";
import {
  applyLocale,
  persistLocale,
  readStoredLocale,
  type LocaleCode,
} from "../lib/locale";
import { LocaleContext } from "../lib/localeContext";

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = React.useState<LocaleCode>(readStoredLocale);

  React.useEffect(() => {
    applyLocale(locale);
    persistLocale(locale);
  }, [locale]);

  const setLocale = React.useCallback((nextLocale: LocaleCode) => {
    setLocaleState(nextLocale);
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
};
