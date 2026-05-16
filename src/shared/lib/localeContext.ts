import React from "react";
import type { LocaleCode } from "./locale";

export interface LocaleContextValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
}

export const LocaleContext = React.createContext<LocaleContextValue | null>(null);
