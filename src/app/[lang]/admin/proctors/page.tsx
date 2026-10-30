import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { addDaysToDateKey, dateKeyOf, formatLongDate } from "@/lib/time";
import { inviteSupervisor, recordCheck, verifyCheck } from "../actions";
import { AdminFrame } from "../admin-frame";

export const metadata: Metadata = { title: "Supervisors" };

export default async function ProctorsPage({ searchParams }: PageProps<"/[lang]/admin/proctors">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Proctors searchParams={searchParams} />
    </Suspense>
  );
}

type Check = { id: string; wwcc_number: string; wwcc_expiry: string; verified_at: string | null };
type Supervisor = { id: string; full_name: string | null; email: string; proctor_checks: Check[] };

async function Proctors({ searchParams }: Pick<PageProps<"/[lang]/admin/proctors">, "searchParams">) {
  const [t, query] = await Promise.all([getDictionary(), searchParams]);
  const p = t.adminPages.proctors;
  const supabase = await createClient();
  // proctor_checks reaches profiles twice (proctor_id, verified_by): name the FK.
  const { data: supervisors } = await supabase
    .from("profiles")
    .select("id, full_name, email, proctor_checks!proctor_checks_proctor_id_fkey(id, wwcc_number, wwcc_expiry, verified_at)")
    .in("role", ["proctor", "admin"]) // admins can supervise too, with a verified check
    .order("full_name")
    .returns<Supervisor[]>();
  const today = dateKeyOf();
  const soon = addDaysToDateKey(today, 30);

  return (
    <AdminFrame title={p.title} current="proctors">
      <p className="text-sm text-ink-soft">{p.intro}</p>
      {query.error === "invite" && (
        <p role="alert" className="rounded-md border border-pen-faint px-3 py-2 text-sm text-pen">
          {p.inviteError}
        </p>
      )}
      <ul className="flex flex-col gap-3" data-testid="supervisors">
        {supervisors?.map((sup) => {
          const latest = [...sup.proctor_checks].sort((a, b) => b.wwcc_expiry.localeCompare(a.wwcc_expiry))[0];
          const status = !latest
            ? p.noCheck
            : latest.wwcc_expiry < today
              ? p.expired
              : !latest.verified_at
                ? p.unverified
                : latest.wwcc_expiry <= soon
                  ? `${fill(p.verifiedOn, { date: formatLongDate(latest.verified_at) })} · ${p.expiring}`
                  : fill(p.verifiedOn, { date: formatLongDate(latest.verified_at) });
          const warn = !latest || !latest.verified_at || latest.wwcc_expiry <= soon;
          return (
            <li key={sup.id} className="flex flex-col gap-3 rounded-md border border-hair bg-sheet p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="font-medium">{sup.full_name ?? sup.email}</span>
                <span className={`font-mono text-xs ${warn ? "text-pen" : "text-ink-soft"}`}>{status}</span>
              </div>
              {latest && (
                <p className="font-mono text-sm text-ink-soft">
                  {p.number} {latest.wwcc_number} · {p.expiry} {formatLongDate(`${latest.wwcc_expiry}T00:00:00+10:00`)}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3 text-sm">
                {latest && !latest.verified_at && latest.wwcc_expiry >= today && (
                  <form action={verifyCheck}>
                    <input type="hidden" name="checkId" value={latest.id} />
                    <Button type="submit">{p.verify}</Button>
                  </form>
                )}
                <form action={recordCheck} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="proctorId" value={sup.id} />
                  <label className="flex flex-col gap-1">
                    {p.number}
                    <Input name="number" required minLength={3} maxLength={40} />
                  </label>
                  <label className="flex flex-col gap-1">
                    {p.expiry}
                    <Input name="expiry" type="date" required />
                  </label>
                  <Button type="submit" variant="outline">
                    {p.record}
                  </Button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
      <form action={inviteSupervisor} className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-rule p-4 text-sm" aria-label={p.invite}>
        <span className="w-full font-medium">{p.invite}</span>
        <label className="flex flex-col gap-1">
          {p.inviteName}
          <Input name="fullName" required />
        </label>
        <label className="flex flex-col gap-1">
          {p.inviteEmail}
          <Input name="email" type="email" required />
        </label>
        <Button type="submit">{p.inviteSend}</Button>
      </form>
    </AdminFrame>
  );
}
