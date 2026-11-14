"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signUpTutor, type SignUpState } from "./actions";

const input = "dash-field !h-12 !text-base";

export function SignUpForm({ termsHref, privacyHref, loginHref }: { termsHref: string; privacyHref: string; loginHref: string }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUpTutor, { status: "idle" });
  // A referral link (/tutors?ref=CODE): read after hydration so the page itself can stay static.
  const [ref, setRef] = useState("");
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once on mount
    if (/^[A-Za-z2-9]{8}$/.test(code)) setRef(code.toUpperCase());
  }, []);
  if (state.status === "sent") {
    return (
      <p role="status" className="dash-card p-4">
        Check <strong>{state.email}</strong> for a sign-in link. Open it on this phone or computer to get started.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3" id="signup">
      {ref && (
        <>
          <input type="hidden" name="ref" value={ref} />
          <p className="rounded-md bg-[var(--tiles-sage-soft)] px-3 py-2 text-sm text-[var(--tiles-sage-ink)]" data-testid="referral-note">
            A tutor invited you. When you upgrade to Solo, you both get a month free.
          </p>
        </>
      )}
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
      <button type="submit" disabled={pending} className="dash-btn dash-btn--primary h-12 text-base">
        {pending ? "Sending…" : "Create my account"}
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
