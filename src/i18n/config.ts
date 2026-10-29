/**
 * Locales and locale-aware paths. Pure functions, safe in the proxy, Server and Client Components.
 *
 * URLs: English keeps the spec's paths (/parent, /login …). Simplified Chinese lives under /zh
 * (/zh/parent, /zh/login …). Internally every page is under app/[lang]; the proxy rewrites
 * unprefixed paths to /en/… and redirects /en/… back to the unprefixed URL.
 */

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Remembers an explicit choice from the language switch. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Value for <html lang>. */
export const HTML_LANG: Record<Locale, string> = { en: "en-AU", zh: "zh-CN" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** '/zh/parent' -> { locale: 'zh', path: '/parent' }; '/parent' -> { locale: null, path: '/parent' }. */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const match = /^\/(en|zh)(?=\/|$)(.*)$/.exec(pathname);
  if (!match) return { locale: null, path: pathname };
  return { locale: match[1] as Locale, path: match[2] || "/" };
}

/** The public URL of an unprefixed app path in a locale: ('/parent', 'zh') -> '/zh/parent'. */
export function localizePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Pick a locale from an Accept-Language header: any Chinese variant -> zh, otherwise en. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())?.[1]).find(Boolean);
      return { tag, q: q === undefined ? 1 : Number(q) };
    })
    .filter(({ tag, q }) => tag && q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    if (tag === "zh" || tag.startsWith("zh-")) return "zh";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return DEFAULT_LOCALE;
}
