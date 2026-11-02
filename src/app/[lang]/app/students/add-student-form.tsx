"use client";

import { useState } from "react";
import { addStudent } from "../actions";
import { LANG_LABELS, YEAR_LEVELS, field, labelClass, primaryButton } from "../_components/styles";

/** Add a student, and their family (the parent who gets reports and invoices) if it's new. */
export function AddStudentForm({
  families,
  defaultLang,
  next,
}: {
  families: { id: string; parent_name: string }[];
  defaultLang: "en" | "zh-CN" | "both";
  next?: "log";
}) {
  const [familyId, setFamilyId] = useState(families.length ? "" : "new");
  return (
    <form action={addStudent} className="flex flex-col gap-4 rounded-lg border border-hair bg-sheet p-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <label className={labelClass}>
          First name
          <input name="firstName" className={field} required maxLength={50} autoComplete="off" />
        </label>
        <label className={labelClass}>
          Last initial
          <input name="lastInitial" className={field} required maxLength={1} autoComplete="off" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelClass}>
          Year level
          <select name="yearLevel" className={field} defaultValue={11}>
            {YEAR_LEVELS.map((y) => (
              <option key={y.value} value={y.value}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Subjects
          <input name="subjects" className={field} placeholder="Maths Methods, Chemistry" maxLength={400} />
        </label>
      </div>
      <label className={labelClass}>
        Notes (optional, private to you)
        <input name="notes" className={field} maxLength={500} placeholder="e.g. Tuesdays 4pm, prefers worked examples" />
      </label>

      <label className={labelClass}>
        Family (parent)
        <select name="familyId" className={field} value={familyId} onChange={(e) => setFamilyId(e.target.value)} required>
          {families.length > 0 && <option value="">Choose…</option>}
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.parent_name}
            </option>
          ))}
          <option value="new">+ New family</option>
        </select>
      </label>
      {familyId === "new" && (
        <fieldset className="flex flex-col gap-3 border-l-2 border-rule pl-3">
          <label className={labelClass}>
            Parent&apos;s name
            <input name="parentName" className={field} required maxLength={100} />
          </label>
          <label className={labelClass}>
            Parent&apos;s email (reports and invoices go here)
            <input name="parentEmail" type="email" className={field} required inputMode="email" autoComplete="off" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Report language
              <select name="reportLang" className={field} defaultValue={defaultLang}>
                {Object.entries(LANG_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Hourly rate (A$, optional)
              <input name="rate" className={field} inputMode="decimal" placeholder="Your default" pattern="\d{1,4}(\.\d{1,2})?" />
            </label>
          </div>
        </fieldset>
      )}
      <button type="submit" className={primaryButton}>
        {next === "log" ? "Add and log a session" : "Add student"}
      </button>
    </form>
  );
}
