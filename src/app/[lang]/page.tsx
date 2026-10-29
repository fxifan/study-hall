import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import { buttonVariants } from "@/components/ui/button";
import { localizePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";

// Placeholder. The real landing page (design/landing.html) is ported in Phase 1.
export default async function Home() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-mono text-xs tracking-widest text-pen uppercase">{t.home.kicker}</p>
        <LanguageSwitch locale={locale} className="text-sm text-ink-soft underline-offset-4 hover:underline" />
      </div>
      <h1 className="text-5xl font-medium tracking-tight">Study Hall</h1>
      <p className="text-lg text-ink-soft">{t.home.lead}</p>
      <div>
        <Link href={localizePath("/login", locale)} className={buttonVariants({ size: "lg" })}>
          {t.home.logIn}
        </Link>
      </div>
    </main>
  );
}
