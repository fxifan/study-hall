"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { breakoutAllowed } from "@/lib/breakouts";
import { startBreakout, type BreakoutState } from "../../actions";

type Copy = Dictionary["proctor"]["session"]["breakouts"];
type Adult = { id: string; name: string; session_role: "tutor" | "supervisor" | null };

const fieldClass = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

/**
 * Logs a breakout the supervisor has just opened in Zoom. The start button stays disabled until the
 * group meets the rule (two students, or one student and a second adult); the database checks again.
 */
export function BreakoutForm({
  sessionId,
  adults,
  students,
  busyStudentIds,
  t,
}: {
  sessionId: string;
  adults: Adult[];
  students: { id: string; name: string }[];
  busyStudentIds: string[];
  t: Copy;
}) {
  const [state, action, pending] = useActionState<BreakoutState, FormData>(startBreakout, { status: "idle" });
  const [studentCount, setStudentCount] = useState(0);
  const [hasSecondAdult, setHasSecondAdult] = useState(false);
  const allowed = breakoutAllowed(studentCount, hasSecondAdult);
  const busy = new Set(busyStudentIds);
  const adultLabel = (a: Adult) => (a.session_role ? `${a.name} (${t.roles[a.session_role]})` : a.name);

  function onChange(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    setStudentCount(data.getAll("studentId").length);
    setHasSecondAdult(Boolean(data.get("secondAdultId")));
  }

  // Submitted by hand rather than through the form's action prop, so a refused breakout keeps its
  // selections instead of React resetting the form. A started one remounts it (keyed by the page).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={onSubmit} onChange={onChange} className="flex flex-col gap-3" aria-label={t.logHeading}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t.adult}
          <select name="adultId" defaultValue={adults[0]?.id} className={fieldClass}>
            {adults.map((a) => (
              <option key={a.id} value={a.id}>
                {adultLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t.secondAdult}
          <select name="secondAdultId" defaultValue="" className={fieldClass}>
            <option value="">{t.none}</option>
            {adults.map((a) => (
              <option key={a.id} value={a.id}>
                {adultLabel(a)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm">{t.students}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {students.map((s) => (
            <label key={s.id} className={`flex items-center gap-2 text-sm ${busy.has(s.id) ? "text-ink-faint" : ""}`}>
              <input type="checkbox" name="studentId" value={s.id} disabled={busy.has(s.id)} />
              {s.name}
              {busy.has(s.id) && <span className="font-mono text-xs">({t.inBreakout})</span>}
            </label>
          ))}
        </div>
      </fieldset>
      {studentCount > 0 && !allowed && (
        <p role="status" className="text-sm text-pen">
          {t.needMore}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-pen">
          {t.errors[state.code]}
        </p>
      )}
      <Button type="submit" variant="outline" className="self-start" disabled={pending || !allowed}>
        {pending ? t.starting : t.start}
      </Button>
    </form>
  );
}
