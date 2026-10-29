import type { Metadata } from "next";
import { JetBrains_Mono, Newsreader } from "next/font/google";
import { HTML_LANG, LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import "../globals.css";

// Self-hosted at build time by next/font, so pages make no requests to Google (spec §8.8).
// Neither font has Chinese glyphs; globals.css falls back to the system's Chinese fonts.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: { default: "Study Hall", template: "%s · Study Hall" },
    description: t.meta.description,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  return (
    <html lang={HTML_LANG[locale]} className={`${newsreader.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
