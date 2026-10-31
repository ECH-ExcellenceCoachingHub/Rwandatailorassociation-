"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import dictionary, { type Dictionary } from "@/lib/i18n/dictionary";
import dashboardDictionary, {
  type DashboardDictionary,
} from "@/lib/i18n/dashboard";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_STORAGE_KEY,
  isLocale,
} from "@/lib/i18n/locale";
import type { Locale } from "@/types";
import { useSiteRouter } from "@/hooks/use-site-paths";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /// Marketing site copy.
  t: Dictionary;
  /// Dashboard copy. Separate because the two vocabularies barely overlap.
  d: DashboardDictionary;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Starts on DEFAULT_LOCALE rather than a hardcoded language, and must stay
  // in step with what the server assumed when it rendered: a page's server
  // components read the cookie, which falls back to DEFAULT_LOCALE when there
  // is none, so anything else here would have the sidebar and the table beside
  // it disagreeing until the first effect ran.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const router = useSiteRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!isLocale(stored)) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage, not derived render state
    setLocaleState(stored);

    // Anyone who chose a language before the cookie existed has the choice in
    // localStorage only, where the server cannot see it. Mirror it across, or
    // their dashboard pages would keep rendering in the default language
    // forever, whatever they picked.
    if (!document.cookie.includes(`${LOCALE_COOKIE}=${stored}`)) {
      writeLocaleCookie(stored);
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);

    // The dashboard's pages are server components, so the switch has to reach
    // the server too: the cookie carries the choice on the next request, and
    // refresh() is what makes that request happen. Without the refresh a member
    // would flip the toggle and watch the sidebar change language while the
    // page beside it stayed in English.
    writeLocaleCookie(next);
    router.refresh();
  }

  return (
    <LanguageContext.Provider
      value={{
        locale,
        setLocale,
        t: dictionary[locale],
        d: dashboardDictionary[locale],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
