import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { localizePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { TUTOR_PRODUCT_NAME } from "@/lib/tutor/config";
import type { Tutor } from "@/lib/tutor/server";

/**
 * Frame for the tutor product (/app). Mobile first (spec §8: the phone is the main device): a
 * compact header and a bottom tab bar on small screens, top links on wider ones. English only for
 * now, like Study Hall's admin pages; reports and emails are bilingual.
 */
const NAV = [
  { key: "today", href: "/app", label: "Dashboard" },
  { key: "log", href: "/app/log", label: "Log" },
  { key: "students", href: "/app/students", label: "Students" },
  { key: "invoices", href: "/app/invoices", label: "Invoices" },
  { key: "settings", href: "/app/settings", label: "Settings" },
] as const;
export type NavKey = (typeof NAV)[number]["key"];

export function appHref(path: string, locale: Locale): string {
  return localizePath(path, locale);
}

export async function TutorShell({
  tutor,
  title,
  current,
  children,
  back,
  wide = false,
  hideTitle = false,
}: {
  tutor: Tutor;
  title: string;
  current?: NavKey;
  children: ReactNode;
  back?: { href: string; label: string };
  /** The dashboard uses a wider page; everything else stays at a comfortable reading width. */
  wide?: boolean;
  /** The page renders its own heading (the dashboard greeting). */
  hideTitle?: boolean;
}) {
  const locale = await getLocale();
  return (
    <div className="flex flex-1 flex-col pb-20 sm:pb-0" lang="en">
      <header className="border-b border-rule bg-sheet">
        <div className={`mx-auto flex w-full ${wide ? "max-w-6xl" : "max-w-3xl"} items-center justify-between gap-3 px-4 py-3`}>
          <Link href={appHref("/app", locale)} className="font-mono text-xs tracking-widest text-pen uppercase">
            {TUTOR_PRODUCT_NAME}
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-4 text-sm sm:flex">
            {NAV.map((n) => (
              <Link
                key={n.key}
                href={appHref(n.href, locale)}
                aria-current={n.key === current ? "page" : undefined}
                className={n.key === current ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}
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
      <main className={`mx-auto flex w-full ${wide ? "max-w-6xl" : "max-w-3xl"} flex-1 flex-col gap-5 px-4 py-5 sm:py-8`}>
        {back && (
          <Link href={appHref(back.href, locale)} className="text-sm text-ink-soft hover:text-ink">
            ← {back.label}
          </Link>
        )}
        {!hideTitle && <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{title}</h1>}
        {children}
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-rule bg-sheet pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {NAV.map((n) => (
          <Link
            key={n.key}
            href={appHref(n.href, locale)}
            aria-current={n.key === current ? "page" : undefined}
            className={`flex h-14 items-center justify-center text-xs ${n.key === current ? "font-semibold text-ink" : "text-ink-soft"}`}
          >
            {n.key === "log" ? <span className="rounded-full bg-ink px-3 py-1.5 text-paper">+ Log</span> : n.label}
          </Link>
        ))}
      </nav>
      <p className="sr-only">Signed in as {tutor.tutor.display_name}</p>
    </div>
  );
}

export function Loading() {
  return <p className="mx-auto w-full max-w-3xl px-4 py-8 font-mono text-sm text-ink-faint">Loading…</p>;
}

/** Status / error line under a form, from ?saved= or ?error= in the URL. */
export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-sm ${tone === "error" ? "border-pen text-pen" : "border-hair bg-sheet"}`}
    >
      {children}
    </p>
  );
}

export { card, field, labelClass, primaryButton, secondaryButton, YEAR_LEVELS, yearLabel, LANG_LABELS } from "./styles";
