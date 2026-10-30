import { ReportCards } from "@/components/report-cards";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { en, type Dictionary } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import { fill } from "@/i18n/fill";
import { FLAG_TYPES, type ReportCardData } from "@/lib/report-card";
import { addFlag, removeFlag, reviewReport, sendHelpMessage, setAttendance, updateHelp } from "../../actions";

const fieldClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";
const heading = "font-mono text-xs tracking-widest text-ink-soft uppercase";

export type Attendance = { student_id: string; status: string; check_in_at: string | null };
export type Flag = { id: string; student_id: string; type: string; created_at: string };
export type HelpRow = {
  id: string;
  student_id: string;
  subject: string;
  description: string;
  status: "open" | "helping" | "resolved";
  priority: boolean;
  created_at: string;
  messages: { id: string; sender_id: string; body: string; created_at: string }[];
};
type Hidden = { sessionId: string; studentId: string };

function Ids({ sessionId, studentId }: Hidden) {
  return (
    <>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="studentId" value={studentId} />
    </>
  );
}

/** Attendance and one-tap flags for one student: no modals, usable beside the Zoom window. */
export function StudentControls({
  ids,
  name,
  attendance,
  flags,
  t,
  time,
}: {
  ids: Hidden;
  name: string;
  attendance: Attendance | undefined;
  flags: Flag[];
  t: Dictionary["proctor"]["session"]["live"];
  time: (iso: string) => string;
}) {
  const current = attendance?.status ?? "unknown";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" data-testid={`controls-${ids.studentId}`}>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`${t.attendance}: ${name}`}>
        {(["present", "late", "left_early", "absent"] as const).map((status) => (
          <form key={status} action={setAttendance}>
            <Ids {...ids} />
            <input type="hidden" name="status" value={status} />
            <Button type="submit" size="sm" variant={current === status ? "default" : "outline"} aria-pressed={current === status}>
              {t.status[status]}
            </Button>
          </form>
        ))}
      </div>
      {attendance?.check_in_at && <span className="font-mono text-xs text-ink-soft">{fill(t.joinedAt, { time: time(attendance.check_in_at) })}</span>}
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`${t.flags}: ${name}`}>
        {FLAG_TYPES.map((type) => {
          const count = flags.filter((f) => f.type === type).length;
          return (
            <form key={type} action={addFlag}>
              <Ids {...ids} />
              <input type="hidden" name="type" value={type} />
              <Button type="submit" size="sm" variant="ghost">
                {t.flagNames[type]}
                {count > 0 && ` ${count}`}
              </Button>
            </form>
          );
        })}
      </div>
      {flags.map((f) => (
        <form key={f.id} action={removeFlag} className="flex items-center gap-1 font-mono text-xs text-ink-soft">
          <input type="hidden" name="flagId" value={f.id} />
          {t.flagNames[f.type as keyof typeof t.flagNames] ?? f.type} {time(f.created_at)}
          <button type="submit" className="underline underline-offset-2">
            {t.undo}
          </button>
        </form>
      ))}
    </div>
  );
}

export function HelpQueue({
  help,
  names,
  studentProfiles,
  profileId,
  t,
  time,
}: {
  help: HelpRow[];
  names: Map<string, string>;
  studentProfiles: Set<string>;
  profileId: string;
  t: Dictionary["proctor"]["session"]["live"];
  time: (iso: string) => string;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-hair bg-sheet px-4 py-3" data-testid="help-queue">
      <h2 className={heading}>{t.helpQueue}</h2>
      <p className="text-xs text-pen">{t.helpRule}</p>
      {help.length ? (
        <ul className="divide-y divide-rule text-sm">
          {help.map((h) => (
            <li key={h.id} className="flex flex-col gap-1 py-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <b>{names.get(h.student_id)}</b>
                {h.priority && <span className="rounded-full border border-pen-faint px-2 font-mono text-xs text-pen">{t.tutoringFirst}</span>}
                <span>
                  {h.subject}: {h.description}
                </span>
                <span className="font-mono text-xs text-ink-soft">
                  {time(h.created_at)} · {t.statuses[h.status]}
                </span>
              </div>
              {h.messages
                .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
                .map((m) => (
                  <p key={m.id}>
                    <span className="text-ink-soft">
                      {m.sender_id === profileId ? t.you : studentProfiles.has(m.sender_id) ? t.student : t.staff}:
                    </span>{" "}
                    {m.body}
                  </p>
                ))}
              {h.status !== "resolved" && (
                <div className="flex flex-wrap items-center gap-2">
                  {(h.status === "open" ? (["claim", "resolve"] as const) : (["resolve"] as const)).map((action) => (
                    <form key={action} action={updateHelp}>
                      <input type="hidden" name="helpId" value={h.id} />
                      <input type="hidden" name="action" value={action} />
                      <Button type="submit" size="sm" variant="outline">
                        {t[action]}
                      </Button>
                    </form>
                  ))}
                  <form action={sendHelpMessage} className="flex flex-1 gap-2">
                    <input type="hidden" name="helpId" value={h.id} />
                    <input name="body" required maxLength={1000} aria-label={t.reply} placeholder={t.reply} className={`${fieldClass} min-w-40 flex-1`} />
                    <Button type="submit" size="sm" variant="ghost">
                      {t.send}
                    </Button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-faint">{t.noHelp}</p>
      )}
    </section>
  );
}

/** Session-end review: the drafted reports, then a comment and Approve for each student. */
export function ReportReview({
  sessionId,
  students,
  cards,
  reports,
  locale,
  t,
}: {
  sessionId: string;
  students: { id: string; name: string }[];
  cards: ReportCardData[];
  reports: { student_id: string; status: string; proctor_comment: string | null }[];
  locale: Locale;
  t: Dictionary["proctor"]["session"]["review"];
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-hair bg-sheet px-4 py-3" data-testid="report-review">
      <h2 className={heading}>{t.title}</h2>
      <p className="text-sm text-ink-soft">{t.intro}</p>
      {cards.length > 0 && <ReportCards reports={cards} labels={{ en: en.reportCard, zh: zh.reportCard }} initialLang={locale} />}
      <ul className="flex flex-col gap-2">
        {students.map((s) => {
          if (!cards.some((c) => c.id === `${sessionId}:${s.id}`)) {
            return (
              <li key={s.id} className="text-sm text-ink-faint">
                {fill(t.needsAttendance, { name: s.name })}
              </li>
            );
          }
          const report = reports.find((r) => r.student_id === s.id);
          const reviewed = report && report.status !== "draft";
          return (
            <li key={s.id}>
              <form action={reviewReport} className="flex flex-wrap items-center gap-2" aria-label={s.name}>
                <Ids sessionId={sessionId} studentId={s.id} />
                <input
                  name="comment"
                  maxLength={200}
                  defaultValue={report?.proctor_comment ?? ""}
                  aria-label={fill(t.comment, { name: s.name })}
                  placeholder={fill(t.comment, { name: s.name })}
                  className={`${fieldClass} min-w-56 flex-1`}
                />
                <Button type="submit" size="sm" variant={reviewed ? "outline" : "default"}>
                  {reviewed ? t.update : t.approve}
                </Button>
                <span className="font-mono text-xs text-ink-soft">
                  {report?.status === "sent" ? t.sent : reviewed ? t.approved : t.draft}
                </span>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
