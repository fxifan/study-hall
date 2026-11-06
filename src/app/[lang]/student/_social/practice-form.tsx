"use client";

import { useMemo, useState } from "react";
import { KIND_LABEL, MAX_POINTS_PER_RESOURCE, type CurriculumPoint } from "@/lib/social/resources";
import { generateResource } from "./actions";
import { GenerateButton } from "./generate-button";

const FRAMEWORK: Record<string, string> = { vce: "VCE", vc: "Victorian Curriculum" };
const groupKey = (p: Pick<CurriculumPoint, "framework" | "subject" | "level">) => `${p.framework}|${p.subject}|${p.level}`;

/**
 * Make a quiz, flashcards or notes. Students pick up to three Victorian Curriculum or VCE points
 * (questions and the free-response rubrics are written for those points), or type their own topic.
 */
export function PracticeForm({ points, defaultGroup }: { points: CurriculumPoint[]; defaultGroup: string | null }) {
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; items: CurriculumPoint[] }>();
    for (const p of points) {
      const k = groupKey(p);
      if (!m.has(k)) m.set(k, { label: `${FRAMEWORK[p.framework] ?? p.framework} · ${p.subject} · ${p.level}`, items: [] });
      m.get(k)!.items.push(p);
    }
    return [...m.entries()];
  }, [points]);
  const [kind, setKind] = useState<"quiz" | "flashcards" | "notes">("quiz");
  const [source, setSource] = useState<"curriculum" | "topic">(defaultGroup && groups.length ? "curriculum" : "topic");
  const [group, setGroup] = useState(defaultGroup && groups.some(([k]) => k === defaultGroup) ? defaultGroup : (groups[0]?.[0] ?? ""));
  const [chosen, setChosen] = useState<string[]>([]);
  const items = groups.find(([k]) => k === group)?.[1].items ?? [];
  const areas = [...new Set(items.map((p) => p.area ?? "Other"))];
  const ready = source === "curriculum" ? chosen.length > 0 : true;

  return (
    <form action={generateResource} className="flex flex-col gap-4 rounded-xl border border-rule bg-sheet p-4">
      <h2 className="font-medium">Make something to study</h2>
      <fieldset className="grid grid-cols-3 gap-2 text-sm">
        <legend className="sr-only">Type</legend>
        {(["quiz", "flashcards", "notes"] as const).map((k) => (
          <label key={k} className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-center ${kind === k ? "border-ink bg-paper" : "border-rule"}`}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            <span className="font-medium">{KIND_LABEL[k]}</span>
            <span className="text-xs text-ink-faint">{k === "quiz" ? "8 questions, marked" : k === "flashcards" ? "Flip to check" : "Key points"}</span>
          </label>
        ))}
      </fieldset>

      {groups.length > 0 && (
        <div role="radiogroup" aria-label="What to study" className="flex gap-1 rounded-lg bg-paper-deep p-1 text-sm">
          {(["curriculum", "topic"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={source === s}
              onClick={() => setSource(s)}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium ${source === s ? "bg-sheet shadow-sm" : "text-ink-soft"}`}
            >
              {s === "curriculum" ? "From the curriculum" : "My own topic"}
            </button>
          ))}
        </div>
      )}

      {source === "curriculum" ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Subject and level
            <select
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setChosen([]);
              }}
              className="h-10 rounded-md border border-rule bg-paper px-3"
            >
              {groups.map(([k, g]) => (
                <option key={k} value={k}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm">
              Learning points <span className="text-ink-faint">(pick up to {MAX_POINTS_PER_RESOURCE})</span>
            </legend>
            {areas.map((area) => (
              <div key={area} className="flex flex-col gap-1">
                <p className="font-mono text-xs text-ink-faint">{area}</p>
                {items
                  .filter((p) => (p.area ?? "Other") === area)
                  .map((p) => {
                    const on = chosen.includes(p.id);
                    const full = !on && chosen.length >= MAX_POINTS_PER_RESOURCE;
                    return (
                      <label key={p.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${on ? "border-ink bg-paper" : "border-rule"} ${full ? "opacity-50" : ""}`}>
                        <input
                          type="checkbox"
                          name="point"
                          value={p.id}
                          checked={on}
                          disabled={full}
                          onChange={() => setChosen((c) => (on ? c.filter((x) => x !== p.id) : [...c, p.id]))}
                          className="mt-0.5"
                        />
                        {p.summary}
                      </label>
                    );
                  })}
              </div>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            Focus (optional)
            <input name="topic" maxLength={200} placeholder="e.g. exam-style questions, or a specific part" className="h-10 rounded-md border border-rule bg-paper px-3" />
          </label>
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          Topic
          <input name="topic" required minLength={2} maxLength={200} placeholder="e.g. Year 10 quadratics, or Organic chemistry: functional groups" className="h-10 rounded-md border border-rule bg-paper px-3" />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Your notes (optional)
        <textarea name="notes" maxLength={6000} rows={4} placeholder="Paste class notes and Edumi will work from them." className="rounded-md border border-rule bg-paper px-3 py-2" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <GenerateButton label={ready ? `Make ${kind === "quiz" ? "my quiz" : kind}` : "Pick at least one point"} disabled={!ready} />
      </div>
    </form>
  );
}
