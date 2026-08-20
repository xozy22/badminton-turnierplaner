import { createContext, useContext, useState, type ReactNode } from "react";
import type { Translations } from "./i18n/types";
import { en } from "./i18n/en";
import { de } from "./i18n/de";

export type Lang = "en" | "de";

const STORAGE_KEY = "boss_language";

const TRANSLATIONS: Record<Lang, Translations> = { en, de };

export function loadLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "de") return stored;
  } catch (err) {
    console.error("loadLang: failed to read language from localStorage:", err);
  }
  return "en";
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (err) {
    console.error("saveLang: failed to save language to localStorage:", err);
  }
}

interface I18nContextValue {
  t: Translations;
  lang: Lang;
  setLang: (l: Lang) => void;
}

const I18nContext = createContext<I18nContextValue>({
  t: en,
  lang: "en",
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    saveLang(l);
  };

  const t = TRANSLATIONS[lang];

  return (
    <I18nContext.Provider value={{ t, lang, setLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}

/**
 * BCP-47 locale for the chosen language, for Intl.DateTimeFormat and
 * Intl.NumberFormat.
 *
 * en-GB rather than en-US on purpose: a tournament runs on a 24-hour
 * clock, and "14:03" is what every screen in this app shows. en-US would
 * turn that into "2:03 PM" and make the TV display and the printed sheet
 * disagree with the court timers (REVIEW-BACKLOG.md H5).
 */
export function useLocale(): string {
  const { lang } = useContext(I18nContext);
  return lang === "de" ? "de-DE" : "en-GB";
}
