import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { Wordmark } from "@/components/wordmark";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { unseenPromotion } from "@/lib/social/rank-sync";
import type { Access, SocialStudent } from "@/lib/social/server";
import { RankUpCelebration } from "./rank-up";

/**
 * Frame for Edumi's student app (groups, friends, practice). Mobile first, with a bottom tab bar
 * on phones. English only for now, like the tutor app.
 */
const NAV = [
  { key: "groups", href: "/student/groups", label: "Groups" },
  { key: "friends", href: "/student/friends", label: "Friends" },
  { key: "practice", href: "/student/practice", label: "Practice" },
  { key: "me", href: "/student/me", label: "Me" },
] as const;
export type StudentNav = (typeof NAV)[number]["key"];

export async function StudentShell({
  me,
  title,
  current,
  back,
  children,
  celebrate = true,
}: {
  me: SocialStudent;
  title: string;
  current?: StudentNav;
  back?: { href: string; label: string };
  children: ReactNode;
  /** Off on screens where a celebration would interrupt (a quiz in progress, checkout). */
  celebrate?: boolean;
}) {
  const [locale, promotion] = await Promise.all([getLocale(), celebrate ? unseenPromotion(me.profile.id) : null]);
  const href = (p: string) => localizePath(p, locale);
  return (
    <div className="theme-tiles flex flex-1 flex-col pb-20 sm:pb-0" lang="en">
      <header className="border-b border-rule bg-sheet">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href={href("/student/groups")} className="text-ink" aria-label="Edumi home">
            <Wordmark className="text-base" />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm sm:flex">
            {NAV.map((n) => (
              <Link
                key={n.key}
                href={href(n.href)}
                aria-current={n.key === current ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 font-medium ${n.key === current ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={signOut}>
            <button type="submit" className="text-sm text-ink-soft hover:text-ink">
              Log out
            </button>
          </form>
        </div>
      </header>
      <TrialBar access={me.access} href={href("/student/plan")} now={new Date()} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-5 sm:py-8">
        {back && (
          <Link href={href(back.href)} className="text-sm text-ink-soft hover:text-ink">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{title}</h1>
        {children}
      </main>
      {promotion && (
        <RankUpCelebration promotion={{ id: promotion.id, fromTier: promotion.from.tier, toTier: promotion.to.tier, points: promotion.points }} />
      )}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-rule bg-sheet pb-[env(safe-area-inset-bottom)] sm:hidden">
        {NAV.map((n) => (
          <Link
            key={n.key}
            href={href(n.href)}
            aria-current={n.key === current ? "page" : undefined}
            className={`flex h-14 items-center justify-center text-xs ${n.key === current ? "font-semibold text-ink" : "text-ink-soft"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function TrialBar({ access, href, now }: { access: Access; href: string; now: Date }) {
  if (access.kind !== "trial") return null;
  const days = Math.max(0, Math.ceil((Date.parse(access.trialEndsAt) - now.getTime()) / 86_400_000));
  return (
    <div className="border-b border-rule bg-[var(--tiles-pink-soft)] text-[var(--tiles-pink-ink)]">
      <p className="mx-auto w-full max-w-4xl px-4 py-2 text-sm">
        Free trial: {days} day{days === 1 ? "" : "s"} left.{" "}
        <Link href={href} className="font-medium">
          Keep Edumi for A$11.99/month
        </Link>
      </p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="theme-tiles flex flex-1 flex-col gap-4 px-4 py-8" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded bg-paper-deep" />
      <div className="h-40 animate-pulse rounded-lg bg-paper-deep" />
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const cls = tone === "error" ? "border-pen-faint text-pen" : tone === "ok" ? "border-success text-ink" : "border-rule text-ink-soft";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>
      {children}
    </p>
  );
}

export const card = "rounded-2xl border border-rule bg-sheet p-5";
/** A filled Tiles block: add one colour class (bg-brand-soft, bg-[var(--tiles-pink-soft)] …). */
export const tile = "rounded-2xl p-5";
export const primaryBtn =
  "inline-flex h-10 items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50";
export const secondaryBtn =
  "inline-flex h-10 items-center justify-center rounded-full border border-rule bg-sheet px-4 text-sm font-medium text-ink hover:bg-paper-deep disabled:opacity-50";
export const smallBtn = "inline-flex h-8 items-center justify-center rounded-full border border-rule bg-sheet px-3 text-xs font-medium text-ink hover:bg-paper-deep disabled:opacity-50";
