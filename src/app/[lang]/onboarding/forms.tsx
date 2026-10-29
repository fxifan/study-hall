"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OnboardingCopy } from "@/i18n/dictionaries/onboarding.en";
import { fill } from "@/i18n/fill";
import { addStudent, startSignUp, type AddStudentState, type StartState } from "./actions";

export function StartForm({ t }: { t: OnboardingCopy["start"] }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startSignUp, { status: "idle" });
  if (state.status === "sent") {
    return (
      <p role="status" className="text-ink-soft">
        {t.sent}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <Label htmlFor="start-email">{t.email}</Label>
      <Input id="start-email" name="email" type="email" autoComplete="email" required />
      {state.status === "error" && (
        <p role="alert" className="text-sm text-pen">
          {t.errors[state.code]}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {t.submit}
      </Button>
    </form>
  );
}

export function AddStudentForm({ t }: { t: OnboardingCopy["children"] }) {
  const [state, action, pending] = useActionState<AddStudentState, FormData>(addStudent, { status: "idle" });
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" aria-label={t.add}>
      <Field id="firstName" label={t.firstName}>
        <Input id="firstName" name="firstName" required maxLength={50} autoComplete="off" />
      </Field>
      <Field id="lastInitial" label={t.lastInitial}>
        <Input id="lastInitial" name="lastInitial" required maxLength={1} autoComplete="off" className="w-16" />
      </Field>
      <Field id="yearLevel" label={t.yearLevel}>
        <select
          id="yearLevel"
          name="yearLevel"
          required
          defaultValue="11"
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {[7, 8, 9, 10, 11, 12].map((n) => (
            <option key={n} value={n}>
              {fill(t.year, { n })}
            </option>
          ))}
        </select>
      </Field>
      <Field id="school" label={t.school}>
        <Input id="school" name="school" maxLength={100} autoComplete="off" />
      </Field>
      <div className="sm:col-span-2">
        <Field id="studentEmail" label={t.email}>
          <Input id="studentEmail" name="email" type="email" required autoComplete="off" />
        </Field>
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-pen sm:col-span-2">
          {t.errors[state.code]}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {t.add}
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
