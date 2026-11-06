"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { studentSignUp, type JoinState } from "./actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function JoinForm({ invite, lang, privacyHref }: { invite: string; lang: string; privacyHref: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(studentSignUp, { status: "idle" });
  const year = new Date().getFullYear();

  if (state.status === "sent") {
    return (
      <p role="status" className="text-ink-soft">
        Check <strong className="text-ink">{state.email}</strong> for your login link. It works once and expires after an hour.
      </p>
    );
  }
  if (state.status === "under13") {
    return (
      <div role="status" className="flex flex-col gap-2 text-ink-soft">
        <p>
          <strong className="text-ink">You need a parent to set up Edumi for you.</strong> Students under 13 can join when a parent or guardian adds them from
          their own account.
        </p>
        <p>
          Send them this link: <Link href={`/${lang}/onboarding`}>edumi.app/{lang}/onboarding</Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="invite" value={invite} />
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required maxLength={50} autoComplete="given-name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastInitial">Last initial</Label>
          <Input id="lastInitial" name="lastInitial" required maxLength={1} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="yearLevel">Year level</Label>
        <select id="yearLevel" name="yearLevel" required defaultValue="" className="h-10 rounded-md border border-rule bg-sheet px-3">
          <option value="" disabled>
            Choose
          </option>
          {[7, 8, 9, 10, 11, 12].map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
          <option value={13}>University or TAFE</option>
        </select>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Birth month and year</legend>
        <div className="grid grid-cols-2 gap-3">
          <select name="birthMonth" required defaultValue="" aria-label="Birth month" className="h-10 rounded-md border border-rule bg-sheet px-3">
            <option value="" disabled>
              Month
            </option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select name="birthYear" required defaultValue="" aria-label="Birth year" className="h-10 rounded-md border border-rule bg-sheet px-3">
            <option value="" disabled>
              Year
            </option>
            {Array.from({ length: year - 10 - 1940 + 1 }, (_, i) => year - 10 - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-ink-faint">We only use this to check you&apos;re 13 or older.</p>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" name="agree" required className="mt-1" />
        <span>
          I&apos;ve read the <a href={privacyHref}>privacy policy</a>.
        </span>
      </label>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-pen">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating your account…" : "Start my 7-day free trial"}
      </Button>
      <p className="text-xs text-ink-faint">No card needed for the trial. After 7 days Edumi is A$11.99 a month, paid by you or a parent.</p>
    </form>
  );
}
