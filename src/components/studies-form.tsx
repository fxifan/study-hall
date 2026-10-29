import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { saveStudies } from "@/lib/studies-actions";
import { stagesForYear, type Subject } from "@/lib/subjects";

type Selected = { subject_id: string; wants_help: boolean };

/** A child's subjects and current-work note, for parents (sign-up and /parent/student/[id]). */
export function StudiesForm({
  student,
  subjects,
  selected,
  t,
}: {
  student: { id: string; first_name: string; year_level: number; study_note: string | null };
  subjects: Subject[];
  selected: Selected[];
  t: Dictionary["studies"];
}) {
  const chosen = new Map(selected.map((s) => [s.subject_id, s.wants_help]));
  const stages = stagesForYear(student.year_level);
  return (
    <form action={saveStudies} className="flex flex-col gap-4" aria-label={`${t.title}: ${student.first_name}`}>
      <input type="hidden" name="studentId" value={student.id} />
      <p className="text-sm text-ink-soft">{t.intro}</p>
      {stages.map((stage) => (
        <fieldset key={stage} className="rounded-md border border-hair bg-sheet">
          <legend className="ml-3 px-1 font-mono text-xs tracking-widest text-ink-soft uppercase">{t[stage]}</legend>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="px-3 py-1.5 font-normal" />
                <th className="w-20 px-2 py-1.5 text-center font-normal">{t.taking}</th>
                <th className="w-24 px-2 py-1.5 text-center font-normal">{t.help}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {subjects
                .filter((s) => s.stage === stage)
                .map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-1.5">{s.name}</td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" name="taking" value={s.id} defaultChecked={chosen.has(s.id)} aria-label={`${s.name}: ${t.taking}`} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" name="help" value={s.id} defaultChecked={chosen.get(s.id) === true} aria-label={`${s.name}: ${t.help}`} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </fieldset>
      ))}
      <label className="flex flex-col gap-1 text-sm">
        {t.note}
        <textarea
          name="note"
          maxLength={200}
          rows={2}
          defaultValue={student.study_note ?? ""}
          placeholder={t.notePlaceholder}
          className="rounded-lg border border-input bg-transparent px-2.5 py-1.5"
        />
        <span className="text-xs text-ink-faint">{t.noteWarning}</span>
      </label>
      <Button type="submit" variant="outline" className="self-start">
        {t.save}
      </Button>
    </form>
  );
}
