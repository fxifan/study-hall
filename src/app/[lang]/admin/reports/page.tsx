import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/i18n/server";
import { reportEmail } from "@/lib/email/templates";
import { getParentReports } from "@/lib/parent-reports";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { markReportSent } from "../actions";
import { AdminFrame } from "../admin-frame";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Reports />
    </Suspense>
  );
}

type Link = { student_id: string; profiles: { email: string } | null };

/** Sending is manual for now: copy the bilingual text into an email, then mark it sent. */
async function Reports() {
  const r = (await getDictionary()).adminPages.reports;
  const supabase = await createClient();
  const [cards, { data: rows }, { data: links }, origin] = await Promise.all([
    getParentReports(supabase),
    supabase.from("reports").select("session_id, student_id, status"),
    supabase.from("parent_students").select("student_id, profiles(email)").returns<Link[]>(),
    siteOrigin(),
  ]);
  const status = new Map((rows ?? []).map((x) => [`${x.session_id}:${x.student_id}`, x.status]));

  return (
    <AdminFrame title={r.title} current="reports">
      <p className="text-sm text-ink-soft">{r.intro}</p>
      {cards.length ? (
        <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet text-sm" data-testid="report-queue">
          {cards.map((card) => {
            const [sessionId, studentId] = card.id.split(":");
            const email = reportEmail(card, origin);
            const sent = status.get(card.id) === "sent";
            const to = (links ?? []).filter((l) => l.student_id === studentId).flatMap((l) => (l.profiles ? [l.profiles.email] : []));
            return (
              <li key={card.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-medium">
                    {card.student} · {card.date.en}
                  </div>
                  <div className="text-xs text-ink-soft">
                    {r.to}: {to.join(", ")}
                  </div>
                  <div className="text-xs text-ink-soft">
                    {r.subject}: {email.subject}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CopyButton text={email.text} label={r.copy} copied={r.copied} failed={r.copyFailed} />
                  {sent ? (
                    <span className="font-mono text-xs text-ink-soft">{r.sent}</span>
                  ) : (
                    <form action={markReportSent}>
                      <input type="hidden" name="sessionId" value={sessionId} />
                      <input type="hidden" name="studentId" value={studentId} />
                      <Button type="submit" size="sm">
                        {r.markSent}
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ink-soft">{r.none}</p>
      )}
    </AdminFrame>
  );
}
