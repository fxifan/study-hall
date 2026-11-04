import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { isReservedTestEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { AUD_PER_USD, MONTHLY_DRAFT_CAP, UNIT_COSTS_USD } from "@/lib/tutor/config";
import { trialDaysLeft } from "@/lib/tutor/plan";
import { costAudCents, formatAudCents, sumUsage, type UsageTotals } from "@/lib/tutor/costs";
import { addDaysToDateKey, dateKeyOf, formatInZone, zonedDateTimeToUtc } from "@/lib/time";
import { AdminFrame, fieldClass } from "../admin-frame";
import { setTutorPlan } from "./actions";

export const metadata: Metadata = { title: "Tutor costs" };

/**
 * /admin/costs (spec §7): the tutor product's monthly vendor usage and estimated cost, in total and
 * per active tutor, from tutor_usage_events. Founders also switch tutors to Solo here (no Stripe yet).
 * Admins can read tutors and usage only, never tutors' families, students or reports (RLS).
 */
export default function CostsPage({ searchParams }: PageProps<"/[lang]/admin/costs">) {
  return (
    <Suspense fallback={<AppShellFallback label="Loading…" />}>
      <Costs searchParams={searchParams} />
    </Suspense>
  );
}

type Usage = { tutor_id: string; kind: keyof UsageTotals; amount: number | string; created_at: string };
type TutorRow = { id: string; display_name: string; plan: "trial" | "solo"; trial_ends_at: string; created_at: string };

async function Costs({ searchParams }: Pick<PageProps<"/[lang]/admin/costs">, "searchParams">) {
  const query = await searchParams;
  const supabase = await createClient(); // request-time from here on (reads the session)
  const thisMonth = dateKeyOf().slice(0, 7);
  const month = typeof query.month === "string" && /^\d{4}-\d{2}$/.test(query.month) ? query.month : thisMonth;
  const start = zonedDateTimeToUtc(`${month}-01`, "00:00");
  const nextMonth = addDaysToDateKey(`${month}-28`, 7).slice(0, 7);
  const end = zonedDateTimeToUtc(`${nextMonth}-01`, "00:00");

  const [{ data: usage }, { data: tutors }, { data: profiles }] = await Promise.all([
    supabase
      .from("tutor_usage_events")
      .select("tutor_id, kind, amount, created_at")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .returns<Usage[]>(),
    supabase.from("tutors").select("id, display_name, plan, trial_ends_at, created_at").order("created_at").returns<TutorRow[]>(),
    supabase.from("profiles").select("id, email").eq("role", "tutor"),
  ]);
  const email = new Map((profiles ?? []).map((p) => [p.id, p.email as string]));
  const isTest = (id: string) => isReservedTestEmail(email.get(id) ?? "");
  const real = (usage ?? []).filter((u) => !isTest(u.tutor_id));

  const totals = sumUsage(real);
  const cost = costAudCents(totals);
  const byTutor = new Map<string, Usage[]>();
  for (const u of real) byTutor.set(u.tutor_id, [...(byTutor.get(u.tutor_id) ?? []), u]);
  const active = byTutor.size;
  const drafts = real.filter((u) => u.kind === "llm_tokens").length;

  return (
    <AdminFrame title="Tutor costs" current="costs">
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          Month
          <input type="month" name="month" defaultValue={month} className={fieldClass} />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Show
        </Button>
      </form>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Estimated cost", formatAudCents(cost.total)],
          ["Active tutors", String(active)],
          ["Cost per active tutor", active ? formatAudCents(cost.total / active) : "–"],
          ["AI drafts + translations", String(drafts)],
        ].map(([label, value]) => (
          <div key={label} className="dash-card px-4 py-3">
            <p className="text-xs text-ink-soft">{label}</p>
            <p className="text-2xl tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <table className="w-full text-sm">
        <thead className="text-left text-ink-soft">
          <tr>
            <th className="py-1 font-normal">Kind</th>
            <th className="py-1 text-right font-normal">Usage</th>
            <th className="py-1 text-right font-normal">Est. cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule tabular-nums">
          <tr>
            <td className="py-1.5">Transcription</td>
            <td className="text-right">{(totals.transcribe_seconds / 60).toFixed(1)} min</td>
            <td className="text-right">{formatAudCents(cost.transcribe)}</td>
          </tr>
          <tr>
            <td className="py-1.5">LLM</td>
            <td className="text-right">{totals.llm_tokens.toLocaleString("en-AU")} tokens</td>
            <td className="text-right">{formatAudCents(cost.llm)}</td>
          </tr>
          <tr>
            <td className="py-1.5">Email</td>
            <td className="text-right">{totals.email}</td>
            <td className="text-right">{formatAudCents(cost.email)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-ink-faint">
        Estimates from src/lib/tutor/config.ts: US${UNIT_COSTS_USD.transcribePerMinute}/audio minute, US${UNIT_COSTS_USD.llmPerMillionTokens}/1M
        tokens, US${UNIT_COSTS_USD.perEmail}/email, A${AUD_PER_USD} per US$1. Check against vendor invoices. Test accounts (*.test, example.com) are left out.
        Fixed costs (Supabase, Vercel, Resend plans) aren&apos;t included.
      </p>

      <h2 className="text-lg font-medium">Tutors</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-ink-soft">
          <tr>
            <th className="py-1 font-normal">Tutor</th>
            <th className="py-1 font-normal">Plan</th>
            <th className="py-1 text-right font-normal">Drafts</th>
            <th className="py-1 text-right font-normal">Est. cost</th>
            <th className="py-1 font-normal" />
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {(tutors ?? []).map((t) => {
            const rows = byTutor.get(t.id) ?? [];
            const trialOver = t.plan === "trial" && trialDaysLeft(t.trial_ends_at) === 0;
            return (
              <tr key={t.id} className={isTest(t.id) ? "text-ink-faint" : ""}>
                <td className="py-2">
                  {t.display_name}
                  <br />
                  <span className="text-xs text-ink-soft">{email.get(t.id)}</span>
                </td>
                <td>
                  {t.plan === "solo" ? "Solo" : trialOver ? "Trial ended" : `Trial to ${formatInZone(t.trial_ends_at, "d MMM")}`}
                </td>
                <td className="text-right tabular-nums">
                  {rows.filter((r) => r.kind === "llm_tokens").length}/{MONTHLY_DRAFT_CAP}
                </td>
                <td className="text-right tabular-nums">{formatAudCents(costAudCents(sumUsage(rows)).total)}</td>
                <td className="text-right">
                  <form action={setTutorPlan} className="inline-flex gap-1">
                    <input type="hidden" name="tutorId" value={t.id} />
                    {t.plan === "solo" ? (
                      <Button type="submit" name="change" value="trial" size="xs" variant="ghost">
                        End Solo
                      </Button>
                    ) : (
                      <>
                        <Button type="submit" name="change" value="solo" size="xs" variant="outline">
                          Set Solo
                        </Button>
                        <Button type="submit" name="change" value="extend" size="xs" variant="ghost">
                          +14 days
                        </Button>
                      </>
                    )}
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!tutors?.length && <p className="text-sm text-ink-soft">No tutors yet.</p>}
    </AdminFrame>
  );
}
