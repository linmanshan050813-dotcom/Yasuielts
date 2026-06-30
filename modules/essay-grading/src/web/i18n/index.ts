import { STORAGE_KEYS } from "../../core/constants.js";
import type { Locale } from "../../core/schema.js";
import { en } from "./en.js";
import { zh, type TranslationKey } from "./zh.js";

const dictionaries = { zh, en } as const;

let currentLocale: Locale = "zh";

export function getLocale(): Locale {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEYS.locale);
    if (stored === "en" || stored === "zh") {
      currentLocale = stored;
    }
  }
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEYS.locale, locale);
  }
}

export function t(key: TranslationKey): string {
  const locale = getLocale();
  return dictionaries[locale][key] ?? dictionaries.zh[key];
}

export function onLocaleChange(handler: (locale: Locale) => void): void {
  window.addEventListener("yasu-locale-change", ((event: CustomEvent<Locale>) => {
    handler(event.detail);
  }) as EventListener);
}

export function emitLocaleChange(locale: Locale): void {
  window.dispatchEvent(new CustomEvent("yasu-locale-change", { detail: locale }));
}
