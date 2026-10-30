import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { StudiesForm } from "@/components/studies-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { OnboardingCopy } from "@/i18n/dictionaries/onboarding.en";
import { fill } from "@/i18n/fill";
import { helpScopeSummary } from "@/i18n/help-scope";
import { getPublicTimetable } from "@/lib/public-timetable";
import { daysSummary, timesSummary } from "@/lib/timetable";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentProfile } from "@/lib/auth";
import { CONTACT_EMAIL } from "@/lib/contact";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/subscription-status";
import { getCurrentLegalDocument } from "@/lib/legal";
import { formatAud } from "@/lib/money";
import { stripeConfigured } from "@/lib/stripe";
import type { Subject } from "@/lib/subjects";
import { createClient } from "@/lib/supabase/server";
import { recordConsent, removeStudent, saveDetails, startCheckout } from "./actions";
import { AddStudentForm, StartForm } from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).onboarding.title };
}

export default async function OnboardingPage({ searchParams }: PageProps<"/[lang]/onboarding">) {
  const [{ onboarding: t, studies, helpScope, common }, locale, blocks] = await Promise.all([
    getDictionary(),
    getLocale(),
    getPublicTimetable(),
  ]);
  const scope = helpScopeSummary(helpScope, locale);
  const when = { days: daysSummary(blocks, locale), times: timesSummary(blocks, locale) };
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12">
      <div className="flex items-baseline justify-between gap-4">
        <Link href={localizePath("/", locale)} className="font-mono text-xs tracking-widest text-pen uppercase">
          Study Hall
        </Link>
        <LanguageSwitch locale={locale} className="text-sm text-ink-soft underline-offset-4 hover:underline" />
      </div>
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-medium tracking-tight">{t.title}</h1>
        <p className="text-lg text-ink-soft">{t.intro}</p>
      </header>
      <Suspense fallback={<p className="font-mono text-sm text-ink-faint">{common.loading}</p>}>
        <Onboarding t={t} studies={studies} scope={scope} when={when} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const MESSAGES = (t: OnboardingCopy): Record<string, string> => ({
  consent_required: t.consent.required,
  need_consent: t.pay.needConsent,
  need_subjects: t.pay.needSubjects,
  not_configured: t.pay.notConfigured,
  checkout_failed: t.pay.failed,
  cancelled: t.pay.cancelled,
  details: t.children.errors.invalid,
});

async function Onboarding({
  t,
  studies,
  scope,
  when,
  searchParams,
}: {
  t: OnboardingCopy;
  studies: Dictionary["studies"];
  /** The academic-help subjects, as one line. */
  scope: string;
  /** The timetable: days and session times. */
  when: { days: string; times: string };
  searchParams: PageProps<"/[lang]/onboarding">["searchParams"];
}) {
  const [profile, locale, query] = await Promise.all([getCurrentProfile(), getLocale(), searchParams]);
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, price_cents, stripe_price_id, days_per_week, includes_tutoring")
    .eq("active", true)
    .order("price_cents");
  const headlinePrice = plans?.[0] ? formatAud(plans[0].price_cents) : "";

  const included = (
    <section className="rounded-md border border-hair bg-sheet p-5">
      <h2 className="font-mono text-xs tracking-widest text-ink-soft uppercase">{t.included.title}</h2>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-ink-soft">
        {t.included.items.map((item) => (
          <li key={item}>{fill(item, { subjects: scope, ...when })}</li>
        ))}
        {headlinePrice && <li>{fill(t.included.billing, { price: headlinePrice })}</li>}
      </ul>
    </section>
  );

  if (!profile) {
    return (
      <>
        {included}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-medium">{t.start.title}</h2>
          <p className="text-ink-soft">{t.start.body}</p>
          <StartForm t={t.start} />
          <p className="text-sm text-ink-soft">
            {t.start.haveAccount}{" "}
            <Link className="underline underline-offset-4" href={localizePath("/login", locale)}>
              {t.start.logIn}
            </Link>
          </p>
        </section>
      </>
    );
  }

  const [{ data: me }, { data: students }, { data: subjects }, { data: activeSubs }, houseRules, privacy] = await Promise.all([
    supabase.from("profiles").select("full_name, acquisition_source").eq("id", profile.id).single(),
    supabase
      .from("students")
      .select(
        "id, first_name, last_initial, year_level, status, study_note, consents(document, document_version), student_subjects(subject_id, wants_help)",
      )
      .order("created_at"),
    supabase.from("subjects").select("id, name, stage, sort").eq("active", true).order("sort").returns<Subject[]>(),
    supabase.from("subscriptions").select("id").in("status", [...ACTIVE_SUBSCRIPTION_STATUSES]).limit(1),
    getCurrentLegalDocument("house_rules"),
    getCurrentLegalDocument("privacy_child_safety"),
  ]);

  if (activeSubs?.length) {
    return (
      <section className="flex flex-col gap-3 rounded-md border border-hair bg-sheet p-5">
        <h2 className="text-2xl font-medium">{t.done.title}</h2>
        <p className="text-ink-soft">{t.done.body}</p>
        <Link className={buttonVariants({ size: "lg" }) + " self-start"} href={localizePath("/parent", locale)}>
          {t.done.link}
        </Link>
      </section>
    );
  }

  const pending = (students ?? []).filter((s) => s.status !== "active");
  const agreed = (s: (typeof pending)[number]) =>
    [houseRules, privacy].every(
      (doc) => doc && s.consents.some((c) => c.document === doc.document && c.document_version === doc.version),
    );
  const consentDone = pending.length > 0 && pending.every(agreed);
  const notice = query.error ?? (query.checkout === "cancelled" ? "cancelled" : undefined);
  const message = typeof notice === "string" ? MESSAGES(t)[notice] : undefined;

  return (
    <>
      {message && (
        <p role="alert" className="rounded-md border border-pen-faint px-3 py-2 text-sm text-pen">
          {message}
        </p>
      )}
      {included}

      <Step n={1} title={t.steps.details}>
        <form action={saveDetails} className="flex flex-col gap-3">
          <Label htmlFor="fullName">{t.details.name}</Label>
          <Input id="fullName" name="fullName" required maxLength={100} defaultValue={me?.full_name ?? ""} />
          <Label htmlFor="source">{t.details.source}</Label>
          <select
            id="source"
            name="source"
            defaultValue={me?.acquisition_source ?? "none"}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {Object.entries(t.details.sources).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-sm text-ink-faint">{t.details.sourceHelp}</p>
          <Button type="submit" variant="outline" className="self-start">
            {t.details.save}
          </Button>
        </form>
      </Step>

      <Step n={2} title={t.steps.children}>
        {students?.length ? (
          <ul className="divide-y divide-rule rounded-md border border-hair bg-sheet" data-testid="onboarding-children">
            {students.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <span>
                    {s.first_name} {s.last_initial}. · {fill(t.children.year, { n: s.year_level })}
                  </span>
                  <span className="flex items-center gap-3 font-mono text-xs text-ink-soft">
                    {t.children.status[s.status as keyof typeof t.children.status]}
                    {s.status === "invited" && (
                      <form action={removeStudent}>
                        <input type="hidden" name="studentId" value={s.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {t.children.remove}
                        </Button>
                      </form>
                    )}
                  </span>
                </div>
                <details className="group" open={!s.student_subjects.length}>
                  <summary className="cursor-pointer text-sm text-ink-soft" data-testid="studies-summary">
                    {studies.title} ·{" "}
                    {s.student_subjects.length ? fill(studies.summary, { count: s.student_subjects.length }) : studies.none}
                  </summary>
                  <div className="pt-3">
                    <StudiesForm student={s} subjects={subjects ?? []} selected={s.student_subjects} scope={scope} t={studies} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-soft">{t.children.empty}</p>
        )}
        <AddStudentForm t={t.children} />
        <p className="text-sm text-ink-faint">{t.children.minimisation}</p>
      </Step>

      <Step n={3} title={t.steps.consent} id="consent">
        {!pending.length ? (
          <p className="text-ink-soft">{t.consent.needChildren}</p>
        ) : consentDone ? (
          <p className="text-ink-soft" data-testid="consent-done">
            ✓ {fill(t.consent.done, { rules: houseRules?.version ?? "", privacy: privacy?.version ?? "" })}
          </p>
        ) : (
          <form action={recordConsent} className="flex flex-col gap-4">
            <p className="text-ink-soft">{t.consent.intro}</p>
            {houseRules && (
              <ol lang="en" className="list-decimal rounded-md border border-hair bg-sheet py-3 pr-4 pl-9 text-sm leading-relaxed">
                {houseRules.body
                  .split("\n")
                  .filter((l) => l.startsWith("- "))
                  .map((l) => (
                    <li key={l}>{l.slice(2)}</li>
                  ))}
              </ol>
            )}
            <p className="text-sm text-ink-soft">
              {t.consent.privacyIntro}{" "}
              <Link className="underline underline-offset-4" href={localizePath("/legal/privacy", locale)} target="_blank">
                {t.consent.privacyLink}
              </Link>{" "}
              {privacy?.is_draft && <span className="text-pen">{t.consent.draftNote}</span>}
            </p>
            <label className="flex items-start gap-3">
              <input type="checkbox" name="houseRules" required className="mt-1.5 size-4 accent-[var(--ink)]" />
              <span>{t.consent.houseRules}</span>
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" name="privacy" required className="mt-1.5 size-4 accent-[var(--ink)]" />
              <span>{t.consent.privacy}</span>
            </label>
            <Button type="submit" className="self-start">
              {t.consent.submit}
            </Button>
          </form>
        )}
      </Step>

      <Step n={4} title={t.steps.pay} id="pay">
        {(plans ?? []).map((plan) => {
          const count = pending.filter(agreed).length || pending.length || 1;
          return (
            <form key={plan.id} action={startCheckout} className="flex flex-col gap-3 rounded-md border border-hair bg-sheet p-5">
              <input type="hidden" name="planId" value={plan.id} />
              <p className="text-lg">{plan.name}</p>
              <p className="text-sm text-ink-soft">{plan.includes_tutoring ? t.pay.tutoring : t.pay.supervision}</p>
              <p className="font-mono text-sm" data-testid="checkout-summary">
                {fill(t.pay.summary, {
                  count,
                  price: formatAud(plan.price_cents),
                  total: formatAud(plan.price_cents * count),
                })}
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-soft">
                {t.pay.terms.map((term) => (
                  <li key={term}>{fill(term, { email: CONTACT_EMAIL })}</li>
                ))}
              </ul>
              {!stripeConfigured() || !plan.stripe_price_id ? (
                <p className="text-sm text-pen">{t.pay.notConfigured}</p>
              ) : (
                <Button type="submit" size="lg" disabled={!consentDone} className="self-start">
                  {t.pay.submit}
                </Button>
              )}
              {!consentDone && <p className="text-sm text-ink-faint">{t.pay.needConsent}</p>}
            </form>
          );
        })}
      </Step>
    </>
  );
}

function Step({ n, title, id, children }: { n: number; title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-4 border-t border-rule pt-6">
      <h2 className="flex items-baseline gap-3 text-2xl font-medium">
        <span className="font-serif text-pen italic">{n}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
