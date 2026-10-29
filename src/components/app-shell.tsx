import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import type { CurrentProfile } from "@/lib/auth";

/** Header and page frame shared by the signed-in role areas. */
export function AppShell({ profile, title, children }: { profile: CurrentProfile; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-rule bg-sheet">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-mono text-xs tracking-widest text-pen uppercase">Study Hall</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline">{profile.fullName ?? profile.email}</span>
            <span className="rounded-sm border border-hair px-1.5 py-0.5 font-mono text-xs uppercase">{profile.role}</span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Log out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        <h1 className="text-3xl font-medium tracking-tight">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function AppShellFallback() {
  return <p className="mx-auto w-full max-w-5xl px-4 py-8 font-mono text-sm text-ink-faint">Loading…</p>;
}

/** Marks where a later phase's feature will go. */
export function ComingInPhase({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-rule px-4 py-3 text-ink-soft">
      <span className="mr-2 font-mono text-xs text-pen uppercase">Phase {phase}</span>
      {children}
    </p>
  );
}
