import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ACCESS_MESSAGES } from "@/lib/tutor/resources/access";
import { DIFFICULTIES, QUESTION_TYPE_LABELS, QUESTION_TYPES } from "@/lib/tutor/resources/schema";
import { recentTopics, resourceAccessFor, type CurriculumPoint } from "@/lib/tutor/resources/server";
import { requireTutor } from "@/lib/tutor/server";
import { Loading, Notice, TutorShell, field, labelClass, primaryButton, secondaryButton } from "../../_components/shell";
import { createResource } from "../actions";
import { GenerateButton } from "../submit-button";

export const metadata: Metadata = { title: "New resource" };
// Drafting plus the answer check can take up to a minute.
export const maxDuration = 120;

const ERRORS: Record<string, string> = {
  points: "Choose at least one curriculum point (up to 12) from one subject.",
  service: "The AI service didn't respond. Nothing was used up; try again in a minute.",
  shape: "The AI draft came back incomplete. Nothing was used up; try again.",
};

/** /app/resources/new: choose the level and points, then the settings (spec §1). */
export default function NewResourcePage({ searchParams }: PageProps<"/[lang]/app/resources/new">) {
  return (
    <Suspense fallback={<Loading />}>
      <NewResource searchParams={searchParams} />
    </Suspense>
  );
}

const groupKey = (p: Pick<CurriculumPoint, "framework" | "subject" | "unit_or_level">) => `${p.framework}|${p.subject}|${p.unit_or_level}`;
const groupName = (key: string) => {
  const [framework, subject, unit] = key.split("|");
  return framework === "vce" ? `VCE ${subject}, ${unit}` : `${unit} ${subject}`;
};
const isVceEnglish = (key: string) => key.startsWith("vce|English|");

async function NewResource({ searchParams }: Pick<PageProps<"/[lang]/app/resources/new">, "searchParams">) {
  const [me, query] = await Promise.all([requireTutor(), searchParams]);
  const kind = query.kind === "writing_tips" ? "writing_tips" : "practice_set";
  const supabase = await createClient();
  const [{ data: points }, { data: students }, access] = await Promise.all([
    supabase.from("curriculum_points").select("id, framework, subject, unit_or_level, area, code, summary").order("sort").returns<CurriculumPoint[]>(),
    supabase.from("tutor_students").select("id, first_name, last_initial, year_level, subjects").order("first_name"),
    resourceAccessFor(me.tutor),
  ]);
  const groups = new Map<string, CurriculumPoint[]>();
  for (const p of points ?? []) {
    const key = groupKey(p);
    if (kind === "writing_tips" ? !isVceEnglish(key) : isVceEnglish(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const group = typeof query.group === "string" && groups.has(query.group) ? query.group : null;
  const studentId = typeof query.student === "string" && (students ?? []).some((s) => s.id === query.student) ? query.student : "";
  const topics = studentId ? await recentTopics(supabase, studentId) : [];
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;
  const title = kind === "writing_tips" ? "New VCE English writing tips" : "New practice set";

  return (
    <TutorShell tutor={me} title={title} current="resources" back={{ href: "/app/resources", label: "Resources" }}>
      {error && <Notice tone="error">{error}</Notice>}
      {!access.ok && <Notice tone="error">{ACCESS_MESSAGES[access.reason]}</Notice>}
      {!groups.size && <Notice>No curriculum is published for this yet. Edumi is checking it; try again soon.</Notice>}

      {/* Step 1: level (and optionally a student, for topic suggestions). A GET form: nothing is sent to the AI. */}
      <form className="dash-card flex flex-col gap-3 p-4" data-testid="choose-level">
        <input type="hidden" name="kind" value={kind} />
        <label className={labelClass}>
          {kind === "writing_tips" ? "Level" : "Subject and level"}
          <select name="group" defaultValue={group ?? ""} className={field} required>
            <option value="" disabled>
              Choose…
            </option>
            {[...groups.keys()].map((key) => (
              <option key={key} value={key}>
                {groupName(key)}
              </option>
            ))}
          </select>
        </label>
        {!!students?.length && (
          <label className={labelClass}>
            For a student (optional: suggests topics from their recent reports)
            <select name="student" defaultValue={studentId} className={field}>
              <option value="">No one in particular</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_initial}. · Year {s.year_level}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className={secondaryButton}>
          Next
        </button>
      </form>

      {/* Step 2: points and settings, then generate. */}
      {group && access.ok && (
        <form action={createResource} className="dash-card flex flex-col gap-4 p-4" data-testid="resource-settings">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="group" value={group} />
          <input type="hidden" name="student" value={studentId} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              {kind === "writing_tips" ? "Which part of the course?" : "Curriculum points (choose up to 12)"}
            </legend>
            {Object.entries(Object.groupBy(groups.get(group)!, (p) => p.area)).map(([area, rows]) => (
              <div key={area} className="flex flex-col gap-1">
                <p className="text-xs font-medium text-ink-soft">{area}</p>
                {rows!.map((p) => (
                  <label key={p.id} className="flex items-start gap-2 text-sm">
                    <input type={kind === "writing_tips" ? "radio" : "checkbox"} name="point" value={p.id} className="mt-1" required={kind === "writing_tips"} />
                    <span>
                      {p.code && <span className="font-mono text-xs text-ink-soft">{p.code} </span>}
                      {p.summary}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </fieldset>

          {kind === "practice_set" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Number of questions
                <input type="number" name="count" min={5} max={15} defaultValue={8} className={field} />
              </label>
              <label className={labelClass}>
                Difficulty
                <select name="difficulty" defaultValue="standard" className={field}>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d[0].toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:col-span-2">
                <legend className="mb-1 w-full font-medium">Question types</legend>
                {QUESTION_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-1.5">
                    <input type="checkbox" name="type" value={t} defaultChecked={t !== "extended"} />
                    {QUESTION_TYPE_LABELS[t]}
                  </label>
                ))}
              </fieldset>
            </div>
          )}

          <label className={labelClass}>
            {kind === "writing_tips" ? "Anything to focus on (optional)" : "Topics to lean on (optional)"}
            <textarea
              name="focus"
              rows={2}
              defaultValue={topics.join("; ")}
              placeholder={kind === "writing_tips" ? "e.g. topic sentences; embedding quotes" : "e.g. chain rule; tangents"}
              className={field}
            />
            <span className="text-xs font-normal text-ink-soft">
              Short topics, separated by semicolons. Only these words go to the AI: never a name or report.
              {topics.length ? " Suggested from this student's recent reports: edit or clear them." : ""}
            </span>
          </label>

          <GenerateButton className={primaryButton} label="Generate draft" pendingLabel="Drafting… this can take up to a minute" />
          <p className="text-xs text-ink-soft">
            Questions are original and AI-drafted: check every answer before you use them. Maths and science answers are checked a second time, and
            any disagreement is flagged for you.
          </p>
        </form>
      )}
    </TutorShell>
  );
}
