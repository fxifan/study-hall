import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { HTML_LANG, LOCALES } from "@/i18n/config";
import { BRAND } from "@/lib/brand";
import { getDictionary, getLocale } from "@/i18n/server";
import "../globals.css";

// Self-hosted at build time by next/font, so pages make no requests to Google (spec §8.8).
// Edumi: Manrope for headings, Inter for the interface. Neither has Chinese glyphs; globals.css
// falls back to the system's Chinese fonts.
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

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
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || BRAND.url),
    title: { default: `${BRAND.name} · ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
    description: t.meta.description,
    applicationName: BRAND.name,
    openGraph: { siteName: BRAND.name, title: `${BRAND.name} · ${BRAND.tagline}`, description: t.meta.description, type: "website" },
    twitter: { card: "summary", title: `${BRAND.name} · ${BRAND.tagline}`, description: t.meta.description },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  return (
    <html lang={HTML_LANG[locale]} className={`${manrope.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
