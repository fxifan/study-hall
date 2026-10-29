"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ t }: { t: Dictionary["login"] }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    const [before, after] = t.sent.split("{email}");
    return (
      <p role="status" className="text-ink-soft">
        {before}
        <strong className="text-ink">{state.email}</strong>
        {after}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="email">{t.emailLabel}</Label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder={t.emailPlaceholder}
        aria-describedby={state.status === "error" ? "login-error" : undefined}
      />
      {state.status === "error" && (
        <p id="login-error" role="alert" className="text-sm text-pen">
          {t.errors[state.code]}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t.sending : t.submit}
      </Button>
    </form>
  );
}
