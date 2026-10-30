import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fill } from "@/i18n/fill";
import { getDateLocale, getDictionary } from "@/i18n/server";
import { SESSION_HORIZON_DAYS } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/server";
import { MELBOURNE, formatInZone } from "@/lib/time";
import { addSchedule, assignStaff, generateNow, saveSchedule, setSessionStatus } from "../actions";
import { AdminFrame, fieldClass } from "../admin-frame";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage({ searchParams }: PageProps<"/[lang]/admin/schedule">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Schedule searchParams={searchParams} />
    </Suspense>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type UpcomingSession = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  proctor_id: string | null;
  tutor_id: string | null;
  rooms: { name: string; capacity: number } | null;
  enrolments: { count: number }[];
};

async function Schedule({ searchParams }: Pick<PageProps<"/[lang]/admin/schedule">, "searchParams">) {
  const [t, dateLocale, query] = await Promise.all([getDictionary(), getDateLocale(), searchParams]);
  const s = t.adminPages.schedule;
  const supabase = await createClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + SESSION_HORIZON_DAYS * 86_400_000);
  const [{ data: schedules }, { data: sessions }, { data: supervisors }, { data: rooms }] = await Promise.all([
    supabase
      .from("schedules")
      .select("id, days_of_week, start_time, end_time, block_minutes, break_minutes, active, rooms(name)")
      .order("start_time")
      .returns<
        {
          id: string;
          days_of_week: number[];
          start_time: string;
          end_time: string;
          block_minutes: number;
          break_minutes: number;
          active: boolean;
          rooms: { name: string } | null;
        }[]
      >(),
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, status, proctor_id, tutor_id, rooms(name, capacity), enrolments(count)")
      .gt("ends_at", now.toISOString())
      .lt("starts_at", horizon.toISOString())
      .order("starts_at")
      .returns<UpcomingSession[]>(),
    supabase.from("profiles").select("id, full_name, email").in("role", ["proctor", "admin"]).order("full_name"),
    supabase.from("rooms").select("id, name").order("name"),
  ]);
  const when = (iso: string) => formatInZone(iso, `${t.formats.longDate}, ${t.formats.time}`, MELBOURNE, dateLocale);

  return (
    <AdminFrame title={s.title} current="schedule">
      {query.error === "schedule" && (
        <p role="alert" className="rounded-md border border-pen-faint px-3 py-2 text-sm text-pen">
          {s.scheduleError}
        </p>
      )}
      {query.error === "wwcc" && (
        <p role="alert" className="rounded-md border border-pen-faint px-3 py-2 text-sm text-pen">
          {s.wwccError}
        </p>
      )}
      {typeof query.created === "string" && (
        <p role="status" className="rounded-md border border-hair bg-sheet px-3 py-2 text-sm">
          {fill(s.generated, {
            sessions: query.created,
            staffed: String(query.staffed ?? 0),
            enrolled: String(query.enrolled ?? 0),
          })}{" "}
          {query.full && query.full !== "0" ? fill(s.full, { count: String(query.full) }) : ""}
        </p>
      )}

      {schedules?.map((rule) => (
        <form key={rule.id} action={saveSchedule} className="flex flex-col gap-3 rounded-md border border-hair bg-sheet p-4" aria-label={s.rule}>
          <input type="hidden" name="id" value={rule.id} />
          <p className="font-medium">
            {s.rule} · {rule.rooms?.name}
          </p>
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="mb-1 text-ink-soft">{s.days}</legend>
            {WEEKDAYS.map((day, i) => (
              <label key={day} className="flex items-center gap-1">
                <input type="checkbox" name="days" value={i + 1} defaultChecked={rule.days_of_week.includes(i + 1)} />
                {day}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex flex-col gap-1">
              {s.start}
              <Input name="start" type="time" defaultValue={rule.start_time.slice(0, 5)} required />
            </label>
            <label className="flex flex-col gap-1">
              {s.end}
              <Input name="end" type="time" defaultValue={rule.end_time.slice(0, 5)} required />
            </label>
            <label className="flex flex-col gap-1">
              {s.block}
              <Input name="block" type="number" min={10} max={240} defaultValue={rule.block_minutes} className="w-24" />
            </label>
            <label className="flex flex-col gap-1">
              {s.break}
              <Input name="break" type="number" min={0} max={60} defaultValue={rule.break_minutes} className="w-24" />
            </label>
            <label className="flex items-center gap-2 self-end pb-1.5">
              <input type="checkbox" name="active" defaultChecked={rule.active} />
              {s.active}
            </label>
          </div>
          <Button type="submit" variant="outline" className="self-start">
            {s.save}
          </Button>
        </form>
      ))}

      <form action={addSchedule} className="flex flex-col gap-3 rounded-md border border-dashed border-rule p-4" aria-label={s.addRule}>
        <p className="font-medium">{s.addRule}</p>
        <p className="text-sm text-ink-soft">{s.addRuleHelp}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex flex-col gap-1">
            {s.room}
            <select name="roomId" required className={fieldClass}>
              {rooms?.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {s.start}
            <Input name="start" type="time" required />
          </label>
          <label className="flex flex-col gap-1">
            {s.end}
            <Input name="end" type="time" required />
          </label>
          <label className="flex flex-col gap-1">
            {s.block}
            <Input name="block" type="number" min={10} max={240} defaultValue={50} className="w-24" />
          </label>
          <label className="flex flex-col gap-1">
            {s.break}
            <Input name="break" type="number" min={0} max={60} defaultValue={10} className="w-24" />
          </label>
        </div>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="mb-1 text-ink-soft">{s.days}</legend>
          {WEEKDAYS.map((day, i) => (
            <label key={day} className="flex items-center gap-1">
              <input type="checkbox" name="days" value={i + 1} defaultChecked={i < 4} />
              {day}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" />
          {s.active}
        </label>
        <Button type="submit" variant="outline" className="self-start">
          {s.addRule}
        </Button>
      </form>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-medium">{s.upcoming}</h2>
          <form action={generateNow}>
            <Button type="submit">{s.generate}</Button>
          </form>
        </div>
        {sessions?.length ? (
          <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet text-sm" data-testid="upcoming-sessions">
            {sessions.map((session) => {
              const cancelled = session.status === "cancelled";
              return (
                <li key={session.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${cancelled ? "text-ink-faint line-through" : ""}`}>
                  <span className="min-w-56 font-medium">{when(session.starts_at)}</span>
                  <span>{session.rooms?.name}</span>
                  <span className="font-mono text-xs">
                    {fill(s.enrolled, { count: session.enrolments[0]?.count ?? 0, capacity: session.rooms?.capacity ?? 0 })}
                  </span>
                  {(["proctor_id", "tutor_id"] as const).map((role) => (
                    <form key={role} action={assignStaff} className="flex items-center gap-2 no-underline">
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="role" value={role} />
                      <span className="text-xs text-ink-soft">{role === "proctor_id" ? s.supervisor : s.tutor}</span>
                      <select
                        name="personId"
                        defaultValue={session[role] ?? ""}
                        aria-label={role === "proctor_id" ? s.supervisor : s.tutor}
                        className={fieldClass}
                      >
                        <option value="">{s.unassigned}</option>
                        {supervisors?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name ?? p.email}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" variant="ghost" size="sm">
                        {s.assign}
                      </Button>
                    </form>
                  ))}
                  <form action={setSessionStatus} className="ml-auto">
                    <input type="hidden" name="sessionId" value={session.id} />
                    <input type="hidden" name="status" value={cancelled ? "scheduled" : "cancelled"} />
                    <Button type="submit" variant="ghost" size="sm">
                      {cancelled ? s.restore : s.cancel}
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-ink-soft">{s.empty}</p>
        )}
      </section>
    </AdminFrame>
  );
}
