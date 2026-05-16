import React from "react";
import { LocaleContext, type LocaleContextValue } from "../lib/localeContext";

export const useLocale = (): LocaleContextValue => {
  const context = React.useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
};
