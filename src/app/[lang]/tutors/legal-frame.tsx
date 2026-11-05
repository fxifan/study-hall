import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { LegalBody } from "@/components/legal-body";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { TUTOR_PRODUCT_NAME } from "@/lib/tutor/config";
import { TUTOR_LEGAL_VERSION } from "@/lib/tutor/legal";

export async function TutorLegalPage({ title, body }: { title: string; body: string }) {
  const locale = await getLocale();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12" lang="en">
      <Link href={localizePath("/tutors", locale)} className="text-ink" aria-label={`${TUTOR_PRODUCT_NAME} home`}>
        <Wordmark className="text-base" product="for Tutors" />
      </Link>
      <p role="note" className="rounded-md border border-dashed border-pen px-4 py-3 text-sm text-pen">
        Draft for review by Edumi&apos;s founders before launch. Not yet final.
      </p>
      <article className="flex flex-col gap-2">
        <h1 className="text-4xl font-medium tracking-tight">{title}</h1>
        <p className="font-mono text-xs text-ink-faint">Version {TUTOR_LEGAL_VERSION}</p>
        <div className="mt-4">
          <LegalBody body={body} />
        </div>
      </article>
    </main>
  );
}
