import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalBody } from "@/components/legal-body";
import { LanguageSwitch } from "@/components/language-switch";
import { localizePath } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentLegalDocument, type LegalDocumentKind } from "@/lib/legal";
import { formatLongDate } from "@/lib/time";

/** Shared layout for /legal/house-rules and /legal/privacy. Legal text is English only. */
export async function LegalPage({ document }: { document: LegalDocumentKind }) {
  const [doc, t, locale] = await Promise.all([getCurrentLegalDocument(document), getDictionary(), getLocale()]);
  if (!doc) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex items-baseline justify-between gap-4">
        <Link href={localizePath("/", locale)} className="font-mono text-xs tracking-widest text-pen uppercase">
          Study Hall
        </Link>
        <LanguageSwitch locale={locale} className="text-sm text-ink-soft underline-offset-4 hover:underline" />
      </div>
      {doc.is_draft && (
        <p role="note" className="rounded-md border border-dashed border-pen px-4 py-3 text-sm text-pen">
          {t.legal.draft}
        </p>
      )}
      {locale !== "en" && <p className="text-sm text-ink-soft">{t.legal.englishOnly}</p>}
      <article lang="en" className="flex flex-col gap-2">
        <h1 className="text-4xl font-medium tracking-tight">{doc.title}</h1>
        <p className="font-mono text-xs text-ink-faint">
          {fill(t.legal.version, { version: doc.version, date: formatLongDate(doc.published_at) })}
        </p>
        <div className="mt-4">
          <LegalBody body={doc.body} />
        </div>
      </article>
    </main>
  );
}
