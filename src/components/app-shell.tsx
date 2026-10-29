import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { LanguageSwitch } from "@/components/language-switch";
import { Button } from "@/components/ui/button";
import { fill } from "@/i18n/fill";
import { getDictionary, getLocale } from "@/i18n/server";
import type { CurrentProfile } from "@/lib/auth";

/** Header and page frame shared by the signed-in role areas. */
export async function AppShell({ profile, title, children }: { profile: CurrentProfile; title: string; children: ReactNode }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-rule bg-sheet">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-mono text-xs tracking-widest text-pen uppercase">Study Hall</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline">{profile.fullName ?? profile.email}</span>
            <span className="rounded-sm border border-hair px-1.5 py-0.5 font-mono text-xs uppercase">
              {t.roles[profile.role]}
            </span>
            <LanguageSwitch locale={locale} className="text-ink-soft underline-offset-4 hover:underline" />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                {t.common.logOut}
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

export function AppShellFallback({ label }: { label: string }) {
  return <p className="mx-auto w-full max-w-5xl px-4 py-8 font-mono text-sm text-ink-faint">{label}</p>;
}

/** Marks where a later phase's feature will go. */
export async function ComingInPhase({ phase, children }: { phase: number; children: ReactNode }) {
  const t = await getDictionary();
  return (
    <p className="rounded-md border border-dashed border-rule px-4 py-3 text-ink-soft">
      <span className="mr-2 font-mono text-xs text-pen uppercase">{fill(t.common.phase, { n: phase })}</span>
      {children}
    </p>
  );
}
