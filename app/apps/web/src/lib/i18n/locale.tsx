"use client";

/**
 * Locale context + the language switch wiring. The provider is mounted once in
 * the dashboard layout with the cookie-resolved initial locale (no flash);
 * `useLocale()` reads/sets it, `useT()` resolves dictionary keys for the current
 * locale. Default FR. The choice persists to a cookie (so the server can seed
 * the next load) + localStorage.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { messages, translate, DEFAULT_LOCALE, type Locale } from "./messages";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

const ONE_YEAR = 60 * 60 * 24 * 365;

function persist(locale: Locale): void {
  try {
    document.cookie = `locale=${locale};path=/;max-age=${ONE_YEAR};samesite=lax`;
    window.localStorage.setItem("locale", locale);
  } catch {
    // SSR / privacy mode — the in-memory state still works for the session.
  }
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale?: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    persist(l);
  }, []);
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

/** Current locale + setter. Safe outside a provider (defaults to FR / no-op). */
export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** `t(key, vars?)` bound to the current locale (FR fallback, then the key). */
export function useT() {
  const { locale } = useLocale();
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(messages, locale, key, vars),
    [locale],
  );
}
