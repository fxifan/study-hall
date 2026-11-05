import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { MONTHLY_RESOURCE_CAP, TRIAL_RESOURCE_LIMIT } from "@/lib/tutor/config";
import { ACCESS_MESSAGES } from "@/lib/tutor/resources/access";
import { resourceAccessFor } from "@/lib/tutor/resources/server";
import { requireTutor } from "@/lib/tutor/server";
import { formatInZone } from "@/lib/time";
import { Loading, Notice, TutorShell, appHref, primaryButton, secondaryButton } from "../_components/shell";

export const metadata: Metadata = { title: "Resources" };

/** /app/resources: the tutor's library of practice sets and writing tips (spec §1, §7). */
export default function ResourcesPage({ searchParams }: PageProps<"/[lang]/app/resources">) {
  return (
    <Suspense fallback={<Loading />}>
      <Resources searchParams={searchParams} />
    </Suspense>
  );
}

type Row = { id: string; kind: "practice_set" | "writing_tips"; title: string; framework: string; subject: string; unit_or_level: string; status: string; created_at: string };

async function Resources({ searchParams }: Pick<PageProps<"/[lang]/app/resources">, "searchParams">) {
  const [me, locale, query] = await Promise.all([requireTutor(), getLocale(), searchParams]);
  const supabase = await createClient();
  const subject = typeof query.subject === "string" ? query.subject : "";
  let list = supabase.from("tutor_resources").select("id, kind, title, framework, subject, unit_or_level, status, created_at").order("created_at", { ascending: false });
  if (subject) list = list.eq("subject", subject);
  const [{ data }, access, { data: all }] = await Promise.all([
    list.returns<Row[]>(),
    resourceAccessFor(me.tutor),
    supabase.from("tutor_resources").select("subject"),
  ]);
  const subjects = [...new Set((all ?? []).map((r) => r.subject as string))].sort();
  const error = typeof query.error === "string" && query.error in ACCESS_MESSAGES ? ACCESS_MESSAGES[query.error as keyof typeof ACCESS_MESSAGES] : null;

  return (
    <TutorShell tutor={me} title="Resources" current="resources">
      <p className="text-sm text-ink-soft">
        AI-drafted practice sets for VCE and Years 7–10, and VCE English writing tips, built from the Victorian curriculum. Check and approve each one
        before you use it.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {query.deleted && <Notice>Deleted.</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        {access.ok ? (
          <>
            <Link href={appHref("/app/resources/new", locale)} className={primaryButton}>
              New practice set
            </Link>
            <Link href={appHref("/app/resources/new?kind=writing_tips", locale)} className={secondaryButton}>
              New VCE English writing tips
            </Link>
          </>
        ) : (
          <Notice tone="error">{ACCESS_MESSAGES[access.reason]}</Notice>
        )}
        <span className="text-xs text-ink-soft" data-testid="resource-allowance">
          {access.ok
            ? me.tutor.plan === "trial"
              ? `${access.left} of ${TRIAL_RESOURCE_LIMIT} left in your trial`
              : `${access.left} of ${MONTHLY_RESOURCE_CAP} left this month`
            : ""}
        </span>
      </div>

      {subjects.length > 1 && (
        <nav aria-label="Filter by subject" className="flex flex-wrap gap-2 text-sm">
          <Link href={appHref("/app/resources", locale)} className={!subject ? "font-medium" : "text-ink-soft"}>
            All
          </Link>
          {subjects.map((s) => (
            <Link key={s} href={appHref(`/app/resources?subject=${encodeURIComponent(s)}`, locale)} className={s === subject ? "font-medium" : "text-ink-soft"}>
              {s}
            </Link>
          ))}
        </nav>
      )}

      <ul className="flex flex-col gap-2" data-testid="resource-list">
        {(data ?? []).map((r) => (
          <li key={r.id}>
            <Link href={appHref(`/app/resources/${r.id}`, locale)} className="dash-card flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <span>
                <span className="font-medium">{r.title}</span>
                <span className="block text-xs text-ink-soft">
                  {r.kind === "writing_tips" ? "Writing tips" : "Practice set"} · {r.framework === "vce" ? "VCE" : ""} {r.subject} {r.unit_or_level} ·{" "}
                  {formatInZone(r.created_at, "d MMM yyyy")}
                </span>
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${r.status === "approved" ? "border-[var(--dash-accent-line)] text-[var(--dash-accent-text)]" : "border-hair text-ink-soft"}`}>
                {r.status === "approved" ? "Approved" : "AI draft"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!data?.length && <p className="text-sm text-ink-soft">Nothing here yet.</p>}
    </TutorShell>
  );
}
