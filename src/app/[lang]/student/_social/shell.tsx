import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { Wordmark } from "@/components/wordmark";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { friendsNeedAttention } from "@/lib/social/friends";
import { unseenPromotion } from "@/lib/social/rank-sync";
import type { Access, SocialStudent } from "@/lib/social/server";
import { RankUpCelebration } from "./rank-up";

/**
 * Frame for Edumi's student app. Mobile first: a bottom bar on phones with Study as the raised
 * middle button (docs/ui-refresh-and-timer.md); the same five as pills on wider screens. Friends
 * live inside Groups. English only for now, like the tutor app.
 */
const NAV = [
  { key: "home", href: "/student/home", label: "Home" },
  { key: "groups", href: "/student/groups", label: "Groups" },
  { key: "study", href: "/student/solo", label: "Study" },
  { key: "practice", href: "/student/practice", label: "Practice" },
  { key: "me", href: "/student/me", label: "Me" },
] as const;
export type StudentNav = (typeof NAV)[number]["key"] | "friends";

const ICON: Record<(typeof NAV)[number]["key"], ReactNode> = {
  home: <path d="M4 11l8-7 8 7v9H4z" />,
  groups: (
    <>
      <circle cx="9" cy="9" r="3.5" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3 20c0-3.5 3-6 6-6s6 2.5 6 6M15 20c0-2.5 1.5-4.5 4-4.5" />
    </>
  ),
  study: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 9v4l2.5 2M10 3h4" />
    </>
  ),
  practice: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </>
  ),
};

function Icon({ name, className = "" }: { name: (typeof NAV)[number]["key"]; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`size-[22px] fill-none stroke-current ${className}`} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {ICON[name]}
    </svg>
  );
}

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
  const [locale, promotion, friendsDot] = await Promise.all([getLocale(), celebrate ? unseenPromotion(me.profile.id) : null, friendsNeedAttention(me.profile.id)]);
  const href = (p: string) => localizePath(p, locale);
  const active = current === "friends" ? "groups" : current;
  return (
    <div className="theme-tiles flex flex-1 flex-col pb-24 sm:pb-0" lang="en">
      <header className="border-b border-rule bg-sheet">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href={href("/student/home")} className="text-ink" aria-label="Edumi home">
            <Wordmark className="text-base" />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm sm:flex">
            {NAV.map((n) => (
              <Link
                key={n.key}
                href={href(n.href)}
                aria-current={n.key === active ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 font-medium ${n.key === active ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
              >
                {n.label}
                {n.key === "groups" && friendsDot && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-brand align-middle" role="img" aria-label="New" />}
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
      {me.profile.role === "admin" && (
        <div className="border-b border-rule bg-sheet">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="text-ink-soft">Student view · you&apos;re seeing Edumi as a student</span>
            <Link href={href("/admin")} className="font-medium text-ink">
              Back to admin
            </Link>
          </div>
        </div>
      )}
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
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 items-end border-t border-rule bg-sheet px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden">
        {NAV.map((n) => {
          const on = n.key === active;
          return (
            <Link
              key={n.key}
              href={href(n.href)}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-end gap-0.5 text-[11px] no-underline ${on ? "font-semibold text-ink" : "text-ink-soft"}`}
            >
              {n.key === "study" ? (
                <span className={`-mt-7 mb-0.5 grid size-13 place-items-center rounded-full text-paper shadow-[0_10px_24px_-10px_rgba(28,36,48,.6)] ${on ? "bg-[var(--tiles-sage-strong)]" : "bg-ink"}`}>
                  <Icon name="study" />
                </span>
              ) : (
                <span className="relative">
                  <Icon name={n.key} className={on ? "text-[var(--tiles-sage-strong)]" : ""} />
                  {n.key === "groups" && friendsDot && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-brand" role="img" aria-label="New" />}
                </span>
              )}
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function TrialBar({ access, href, now }: { access: Access; href: string; now: Date }) {
  if (access.kind === "none") {
    return (
      <div className="border-b border-rule bg-[var(--tiles-pink-soft)] text-[var(--tiles-pink-ink)]">
        <p className="mx-auto w-full max-w-4xl px-4 py-2 text-sm">
          <Link href={href} className="font-medium">
            Start your 7-day free trial →
          </Link>
        </p>
      </div>
    );
  }
  if (access.kind !== "trial") return null;
  const days = Math.max(0, Math.ceil((Date.parse(access.trialEndsAt) - now.getTime()) / 86_400_000));
  return (
    <div className="border-b border-rule bg-[var(--tiles-pink-soft)] text-[var(--tiles-pink-ink)]">
      <p className="mx-auto w-full max-w-4xl px-4 py-2 text-sm">
        Free trial: {days} day{days === 1 ? "" : "s"} left.{" "}
        <Link href={href} className="font-medium">
          {access.billed ? "Then A$11.99/month" : "Keep Edumi for A$11.99/month"}
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

/** Groups and Friends share the Groups tab: a two-way switch at the top of each. */
export async function GroupsTabs({ current }: { current: "groups" | "friends" }) {
  const locale = await getLocale();
  const tabs = [
    { key: "groups", href: "/student/groups", label: "Groups" },
    { key: "friends", href: "/student/friends", label: "Friends" },
  ] as const;
  return (
    <nav aria-label="Groups and friends" className="flex w-fit rounded-full border border-rule bg-sheet p-1 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={localizePath(t.href, locale)}
          aria-current={t.key === current ? "page" : undefined}
          className={`inline-flex min-h-9 items-center rounded-full px-4 font-medium no-underline ${t.key === current ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
