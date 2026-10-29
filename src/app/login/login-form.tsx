"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <p role="status" className="text-ink-soft">
        If <strong className="text-ink">{state.email}</strong> has a Study Hall account, a login link is on its way.
        It expires in an hour.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        aria-describedby={state.status === "error" ? "login-error" : undefined}
      />
      {state.status === "error" && (
        <p id="login-error" role="alert" className="text-sm text-pen">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Email me a login link"}
      </Button>
    </form>
  );
}
