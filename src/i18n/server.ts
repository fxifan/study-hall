import { enAU, zhCN, type Locale as DateFnsLocale } from "date-fns/locale";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { isLocale, type Locale } from "./config";
import { en, type Dictionary } from "./dictionaries/en";
import { zh } from "./dictionaries/zh";

// Server Components only: next/root-params doesn't work in Client Components, Server Actions or
// Route Handlers. Those read the LOCALE_COOKIE instead.

const dictionaries: Record<Locale, Dictionary> = { en, zh };
const dateLocales: Record<Locale, DateFnsLocale> = { en: enAU, zh: zhCN };

/** The locale of the current route (the [lang] segment). Unknown locales 404. */
export async function getLocale(): Promise<Locale> {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  return locale;
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}

/** date-fns locale for formatInZone, so weekday and month names follow the page language. */
export async function getDateLocale(): Promise<DateFnsLocale> {
  return dateLocales[await getLocale()];
}
