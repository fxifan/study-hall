"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpTutor, type SignUpState } from "./actions";

const input = "h-12 w-full rounded-lg border border-input bg-sheet px-3 text-base";

export function SignUpForm({ termsHref, privacyHref, loginHref }: { termsHref: string; privacyHref: string; loginHref: string }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUpTutor, { status: "idle" });
  if (state.status === "sent") {
    return (
      <p role="status" className="rounded-lg border border-hair bg-sheet p-4">
        Check <strong>{state.email}</strong> for a sign-in link. Open it on this phone or computer to start your 14-day free trial.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3" id="signup">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your name
        <input name="name" className={input} required maxLength={80} autoComplete="name" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <input name="email" type="email" className={input} required autoComplete="email" inputMode="email" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="terms" value="on" required className="mt-0.5 size-5" />
        <span>
          I agree to the{" "}
          <Link className="underline" href={termsHref}>
            Terms
          </Link>{" "}
          and{" "}
          <Link className="underline" href={privacyHref}>
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-pen">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 rounded-lg bg-ink text-base font-medium text-paper disabled:opacity-50">
        {pending ? "Sending…" : "Start free trial"}
      </button>
      <p className="text-sm text-ink-soft">
        Already signed up?{" "}
        <Link className="underline" href={loginHref}>
          Log in
        </Link>
      </p>
    </form>
  );
}
