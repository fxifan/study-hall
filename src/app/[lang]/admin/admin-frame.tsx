import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { localizePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireRole } from "@/lib/auth";

const SECTIONS = ["overview", "rooms", "schedule", "plans", "proctors"] as const;
type Section = (typeof SECTIONS)[number];

/** Admin page frame: checks the role, then the shell plus section navigation. */
export async function AdminFrame({ title, current, children }: { title: string; current: Section; children: ReactNode }) {
  const [profile, t, locale] = await Promise.all([requireRole("admin"), getDictionary(), getLocale()]);
  return (
    <AppShell profile={profile} title={title}>
      <nav aria-label="Admin" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-rule pb-3 text-sm">
        {SECTIONS.map((section) => (
          <Link
            key={section}
            href={localizePath(section === "overview" ? "/admin" : `/admin/${section}`, locale)}
            aria-current={section === current ? "page" : undefined}
            className={section === current ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}
          >
            {t.adminPages.nav[section]}
          </Link>
        ))}
      </nav>
      {children}
    </AppShell>
  );
}

export const fieldClass = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";
