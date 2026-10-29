"use client";

import { usePathname } from "next/navigation";
import { HTML_LANG, splitLocale, type Locale } from "@/i18n/config";

const NAMES: Record<Locale, string> = { en: "English", zh: "中文" };

/**
 * Links to the same page in the other language. It goes through /en/… or /zh/…, which the proxy
 * remembers in the locale cookie. A plain <a> because the two languages have different root layouts.
 */
export function LanguageSwitch({ locale, className }: { locale: Locale; className?: string }) {
  const { path } = splitLocale(usePathname());
  const other: Locale = locale === "zh" ? "en" : "zh";
  return (
    <a href={`/${other}${path === "/" ? "" : path}`} hrefLang={HTML_LANG[other]} lang={HTML_LANG[other]} className={className}>
      {NAMES[other]}
    </a>
  );
}
