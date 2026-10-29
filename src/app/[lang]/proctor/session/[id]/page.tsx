import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell, AppShellFallback } from "@/components/app-shell";
import { localizePath } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDateLocale, getDictionary, getLocale } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MELBOURNE, formatInZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).roles.proctor };
}

export default async function SessionRosterPage({ params }: PageProps<"/[lang]/proctor/session/[id]">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <SessionRoster params={params} />
    </Suspense>
  );
}

type RosterRow = {
  student_id: string;
  first_name: string;
  last_initial: string;
  year_level: number;
  study_note: string | null;
  tutoring: boolean;
  subjects: { name: string; help: boolean }[];
};

/** The session's students with their subjects and current-work notes, so staff can prepare. */
async function SessionRoster({ params }: Pick<PageProps<"/[lang]/proctor/session/[id]">, "params">) {
  const [profile, t, locale, dateLocale, { id }] = await Promise.all([
    requireRole("proctor"),
    getDictionary(),
    getLocale(),
    getDateLocale(),
    params,
  ]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  // RLS: staff only see sessions they're assigned to; the roster function checks the same.
  const [{ data: session }, { data: roster }] = await Promise.all([
    supabase.from("sessions").select("id, starts_at, ends_at, rooms(name)").eq("id", id).maybeSingle<{
      id: string;
      starts_at: string;
      ends_at: string;
      rooms: { name: string } | null;
    }>(),
    supabase.rpc("session_roster", { p_session: id }),
  ]);
  if (!session) notFound();
  const s = t.proctor.session;
  const students: RosterRow[] = roster ?? [];
  const when = `${formatInZone(session.starts_at, t.formats.longDate, MELBOURNE, dateLocale)}, ${formatInZone(session.starts_at, t.formats.time, MELBOURNE, dateLocale)}`;

  return (
    <AppShell profile={profile} title={`${session.rooms?.name ?? t.proctor.room} · ${when}`}>
      <Link href={localizePath("/proctor", locale)} className="text-sm text-ink-soft underline-offset-4 hover:underline">
        ← {s.back}
      </Link>
      <p className="font-mono text-sm text-ink-soft">
        {fill(s.summary, { count: students.length, tutoring: students.filter((r) => r.tutoring).length })}
      </p>
      {students.length ? (
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet" data-testid="roster">
          {students.map((r) => (
            <li key={r.student_id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-medium">
                  {r.first_name} {r.last_initial}.
                </span>
                <span className="font-mono text-xs text-ink-soft">{fill(t.student.year, { year: r.year_level })}</span>
                {r.tutoring && (
                  <span className="rounded-full border border-pen-faint px-2 font-mono text-xs text-pen">{s.tutoring}</span>
                )}
              </div>
              {r.subjects.length ? (
                <ul className="flex flex-wrap gap-1.5 text-sm">
                  {r.subjects.map((sub) => (
                    <li
                      key={sub.name}
                      className={`rounded-md border px-2 py-0.5 ${sub.help ? "border-pen-faint text-pen" : "border-hair text-ink-soft"}`}
                    >
                      {sub.name}
                      {sub.help && <span className="ml-1 font-mono text-xs">· {s.help}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-faint">{s.noSubjects}</p>
              )}
              {r.study_note && (
                <p className="text-sm">
                  <span className="text-ink-soft">{s.note}:</span> {r.study_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">{s.empty}</p>
      )}
      <p className="text-xs text-ink-faint">{s.privacy}</p>
    </AppShell>
  );
}
