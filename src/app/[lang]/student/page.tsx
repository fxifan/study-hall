import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localizePath } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDateLocale, getDictionary, getLocale } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { getCurrentLegalDocument } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";
import { sessionWindow } from "@/lib/session-timer";
import { MELBOURNE, dateKeyOf, dayRangeUtc, formatInZone } from "@/lib/time";
import { leaveSession, markGoals, raiseHelp, saveGoals } from "./actions";
import { JoinButton, SessionTimer } from "./session-controls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).roles.student };
}

export default async function StudentPage({ searchParams }: PageProps<"/[lang]/student">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <StudentHome searchParams={searchParams} />
    </Suspense>
  );
}

type TodaySession = {
  id: string;
  starts_at: string;
  ends_at: string;
  rooms: { name: string } | null;
  schedules: { block_minutes: number; break_minutes: number } | null;
};

async function StudentHome({ searchParams }: Pick<PageProps<"/[lang]/student">, "searchParams">) {
  const [profile, t, locale, dateLocale, query] = await Promise.all([
    requireRole("student"),
    getDictionary(),
    getLocale(),
    getDateLocale(),
    searchParams,
  ]);
  const s = t.student;
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, year_level, status")
    .eq("profile_id", profile.id)
    .maybeSingle();
  const title = student ? fill(s.greeting, { name: student.first_name }) : s.greetingFallback;
  const time = (iso: string) => formatInZone(iso, t.formats.time, MELBOURNE, dateLocale);

  if (!student || student.status !== "active") {
    return (
      <AppShell profile={profile} title={title}>
        <p className="text-ink-soft">{s.notActive}</p>
      </AppShell>
    );
  }

  // RLS only returns sessions this student is enrolled in.
  const { start, end } = dayRangeUtc(dateKeyOf());
  const { data: session } = await supabase
    .from("sessions")
    .select("id, starts_at, ends_at, rooms(name), schedules(block_minutes, break_minutes)")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .neq("status", "cancelled")
    .order("starts_at")
    .limit(1)
    .maybeSingle<TodaySession>();

  if (!session) {
    const { data: next } = await supabase
      .from("sessions")
      .select("starts_at")
      .gte("starts_at", end.toISOString())
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(1)
      .maybeSingle();
    return (
      <AppShell profile={profile} title={title}>
        <p className="text-ink-soft">{s.noSession}</p>
        {next && (
          <p className="font-mono text-sm">
            {fill(s.nextSession, { when: `${formatInZone(next.starts_at, t.formats.longDate, MELBOURNE, dateLocale)} ${time(next.starts_at)}` })}
          </p>
        )}
        <HistoryLink label={s.historyLink} locale={locale} />
      </AppShell>
    );
  }

  const [{ data: goals }, { data: attendance }, { data: requests }, rules] = await Promise.all([
    supabase.from("goals").select("id, position, text, outcome, note").eq("session_id", session.id).order("position"),
    supabase.from("attendance").select("check_in_at, check_out_at").eq("session_id", session.id).maybeSingle(),
    supabase
      .from("help_requests")
      .select("id, subject, description, status, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: false }),
    getCurrentLegalDocument("house_rules"),
  ]);
  const { open, upcoming, doorsAt } = sessionWindow(session.starts_at, session.ends_at);
  const joined = Boolean(attendance?.check_in_at);
  const inRoom = joined && !attendance?.check_out_at;
  const error = typeof query.error === "string" && query.error in s.errors ? s.errors[query.error as keyof typeof s.errors] : null;

  return (
    <AppShell profile={profile} title={title}>
      {error && (
        <p role="alert" className="rounded-md border border-pen-faint px-3 py-2 text-sm text-pen">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-md border border-hair bg-sheet p-5" data-testid="today">
        <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
          {fill(s.today, { room: session.rooms?.name ?? "" })}
        </p>
        <p className="text-2xl">{fill(s.times, { start: time(session.starts_at), end: time(session.ends_at) })}</p>
        <SessionTimer
          startsAt={session.starts_at}
          endsAt={session.ends_at}
          blockMinutes={session.schedules?.block_minutes ?? 50}
          breakMinutes={session.schedules?.break_minutes ?? 10}
          copy={s.timer}
        />
        {upcoming && <p className="text-ink-soft">{fill(s.doorsOpen, { time: time(doorsAt) })}</p>}
        {joined && attendance?.check_in_at && (
          <p className="text-ink-soft">
            {fill(s.joinedAt, { time: time(attendance.check_in_at) })}
            {attendance.check_out_at && ` ${fill(s.leftAt, { time: time(attendance.check_out_at) })}`}
          </p>
        )}
        {open && (
          <div className="flex flex-wrap items-center gap-3">
            {goals?.length ? (
              <JoinButton sessionId={session.id} label={inRoom || !joined ? s.join : s.rejoin} />
            ) : (
              <p className="text-sm text-pen">{s.errors.goals}</p>
            )}
            {inRoom && (
              <form action={leaveSession}>
                <input type="hidden" name="sessionId" value={session.id} />
                <Button type="submit" variant="outline" size="lg">
                  {s.leave}
                </Button>
              </form>
            )}
          </div>
        )}
        {open && goals?.length ? <p className="text-sm text-ink-faint">{s.joinHelp}</p> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-medium">{joined ? s.goals.outcomeTitle : s.goals.title}</h2>
        {!joined ? (
          <form action={saveGoals} className="flex flex-col gap-2">
            <p className="text-sm text-ink-soft">{s.goals.intro}</p>
            <input type="hidden" name="sessionId" value={session.id} />
            {[1, 2, 3].map((n) => (
              <Input
                key={n}
                name={`goal${n}`}
                maxLength={140}
                aria-label={fill(s.goals.placeholder, { n })}
                placeholder={fill(s.goals.placeholder, { n })}
                defaultValue={goals?.find((g) => g.position === n)?.text ?? ""}
              />
            ))}
            <Button type="submit" variant="outline" className="self-start">
              {s.goals.save}
            </Button>
          </form>
        ) : (
          <form action={markGoals} className="flex flex-col gap-4">
            <p className="text-sm text-ink-soft">{s.goals.outcomeIntro}</p>
            {goals?.map((g) => (
              <fieldset key={g.id} className="flex flex-col gap-2 rounded-md border border-hair bg-sheet p-4">
                <legend className="px-1">{g.text}</legend>
                <input type="hidden" name="goalId" value={g.id} />
                <div className="flex flex-wrap gap-4">
                  {(["done", "partial", "not_done"] as const).map((o) => (
                    <label key={o} className="flex items-center gap-2">
                      <input type="radio" name={`outcome_${g.id}`} value={o} defaultChecked={g.outcome === o} />
                      {s.goals.outcomes[o]}
                    </label>
                  ))}
                </div>
                <Label htmlFor={`note_${g.id}`} className="text-sm text-ink-soft">
                  {s.goals.note}
                </Label>
                <Input id={`note_${g.id}`} name={`note_${g.id}`} maxLength={140} defaultValue={g.note ?? ""} />
              </fieldset>
            ))}
            <Button type="submit" className="self-start">
              {s.goals.saveOutcomes}
            </Button>
          </form>
        )}
      </section>

      {inRoom && (
        <section className="flex flex-col gap-3" data-testid="help">
          <h2 className="text-xl font-medium">{s.help.title}</h2>
          <p className="text-sm text-ink-soft">{s.help.scope}</p>
          <form action={raiseHelp} className="flex flex-col gap-2">
            <input type="hidden" name="sessionId" value={session.id} />
            <Label htmlFor="help-subject">{s.help.subject}</Label>
            <Input id="help-subject" name="subject" required maxLength={60} />
            <Label htmlFor="help-description">{s.help.description}</Label>
            <textarea
              id="help-description"
              name="description"
              required
              maxLength={500}
              rows={3}
              className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
            />
            <Button type="submit" variant="outline" className="self-start">
              {s.help.send}
            </Button>
          </form>
          {requests?.length ? (
            <>
              <h3 className="font-mono text-xs tracking-widest text-ink-soft uppercase">{s.help.yours}</h3>
              <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet">
                {requests.map((r) => (
                  <li key={r.id} className="flex justify-between gap-4 px-4 py-3">
                    <span>
                      <b>{r.subject}:</b> {r.description}
                    </span>
                    <span className="font-mono text-xs whitespace-nowrap text-ink-soft">
                      {s.help.status[r.status as keyof typeof s.help.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      )}

      {rules && (
        <details className="rounded-md border border-hair bg-sheet px-4 py-3">
          <summary className="cursor-pointer">{s.rulesTitle}</summary>
          <ol lang="en" className="mt-2 list-decimal pl-6 text-sm leading-relaxed">
            {rules.body
              .split("\n")
              .filter((l) => l.startsWith("- "))
              .map((l) => (
                <li key={l}>{l.slice(2)}</li>
              ))}
          </ol>
        </details>
      )}
      <HistoryLink label={s.historyLink} locale={locale} />
    </AppShell>
  );
}

function HistoryLink({ label, locale }: { label: string; locale: "en" | "zh" }) {
  return (
    <Link className="text-sm underline underline-offset-4" href={localizePath("/student/history", locale)}>
      {label}
    </Link>
  );
}
