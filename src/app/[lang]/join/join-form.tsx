"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isLocale, localizePath } from "@/i18n/config";
import { studentSignUp, type JoinState } from "./actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function JoinForm({ invite, lang, privacyHref, termsHref }: { invite: string; lang: string; privacyHref: string; termsHref: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(studentSignUp, { status: "idle" });
  const year = new Date().getFullYear();

  if (state.status === "sent") {
    return (
      <p role="status" className="text-ink-soft">
        Check <strong className="text-ink">{state.email}</strong> for your login link. It works once and expires after an hour. Then start your free trial.
      </p>
    );
  }
  if (state.status === "under13") {
    const studyHall = localizePath("/study_hall", isLocale(lang) ? lang : "en");
    return (
      <div role="status" className="flex flex-col gap-2 text-ink-soft">
        <p>
          <strong className="text-ink">Edumi study groups are for students 13 and over.</strong> Younger students can study with a supervisor in Edumi
          Study Hall, which a parent or guardian books for you.
        </p>
        <p>
          Show them Study Hall: <Link href={studyHall}>edumi.app{studyHall}</Link>
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
        <select id="yearLevel" name="yearLevel" required defaultValue="" className="h-10 rounded-full border border-rule bg-sheet px-3">
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
          <select name="birthMonth" required defaultValue="" aria-label="Birth month" className="h-10 rounded-full border border-rule bg-sheet px-3">
            <option value="" disabled>
              Month
            </option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select name="birthYear" required defaultValue="" aria-label="Birth year" className="h-10 rounded-full border border-rule bg-sheet px-3">
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
          I agree to the <a href={termsHref}>terms of use</a> and I&apos;ve read the <a href={privacyHref}>privacy notice</a>.
        </span>
      </label>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-pen">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating your account…" : "Create my account"}
      </Button>
      <p className="text-xs text-ink-faint">7 days free. You add a card to start the trial; after 7 days it&apos;s A$11.99 a month unless you cancel. Paid by you or a parent.</p>
    </form>
  );
}
