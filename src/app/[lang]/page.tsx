import type { Metadata } from "next";
import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import { localizePath } from "@/i18n/config";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import { fill } from "@/i18n/fill";
import { helpScopeSummary } from "@/i18n/help-scope";
import { getDictionary, getLocale } from "@/i18n/server";
import { CONTACT_EMAIL } from "@/lib/contact";
import { getPublicTimetable } from "@/lib/public-timetable";
import { daysSummary, distinctBlocks, formatClock, formatRange, sessionSegments, timesSummary } from "@/lib/timetable";
import { LandingEffects } from "./_landing/landing-effects";
import { LiveStatus } from "./_landing/live-status";
import { Cross, Rich, Tick, Underline } from "./_landing/marks";
import { PlanCards, PlanComparison } from "./_landing/pricing";
import { sampleReports } from "./_landing/sample-data";
import { ReportLines, SampleReport } from "./_landing/sample-report";
import "./landing.css";

/**
 * The marketing page for "/" (design/landing.html), with the positioning from the product brief
 * (docs/product-changes-plan.md, Phase 1A). Copy lives in src/i18n/dictionaries/landing.*.ts.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { landing } = await getDictionary();
  return { title: { absolute: landing.meta.title }, description: landing.meta.description };
}

export default async function LandingPage() {
  const [{ landing: t, helpScope, reportCard }, locale, blocks] = await Promise.all([getDictionary(), getLocale(), getPublicTimetable()]);
  // The timetable comes from the schedule, so trialling different session blocks updates the page.
  const when = { days: daysSummary(blocks, locale), times: timesSummary(blocks, locale) };
  const clock = (minutes: number) => formatClock(minutes, locale);
  const firstBlock = distinctBlocks(blocks)[0];
  const segments = sessionSegments(firstBlock);
  const studies = segments.filter((seg) => seg.kind === "study");
  const span = { from: segments[0].from, to: segments.at(-1)!.to };
  const firstHour = Math.ceil((segments[1].from + 1) / 60) * 60;
  const ticks = [span.from, segments[1].from];
  for (let m = firstHour; m <= span.to; m += 60) ticks.push(m);
  const tickAt = (m: number) => `${((m - span.from) / (span.to - span.from)) * 100}%`;
  const wrapup = segments.at(-1)!;
  // Filled into FAQ answers that mention them.
  const faqValues = { email: CONTACT_EMAIL, subjects: helpScopeSummary(helpScope, locale) };
  const mailto = (
    <a className="link" href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  );

  return (
    <div className="landing">
      <a className="skip" href="#main">
        {t.nav.skip}
      </a>

      <header className="nav">
        <div className="nav-in">
          <Link className="brand" href={localizePath("/", locale)} aria-label="Study Hall">
            Study Hall
            <Tick />
          </Link>
          <nav className="nav-links" aria-label={t.nav.sections}>
            <a href="#how">{t.nav.how}</a>
            <a href="#safety">{t.nav.safety}</a>
            <a href="#pricing">{t.nav.pricing}</a>
            <a href="#faq">{t.nav.faq}</a>
          </nav>
          <div className="nav-cta">
            <LanguageSwitch locale={locale} className="quiet" />
            <Link className="quiet" href={localizePath("/login", locale)}>
              {t.nav.logIn}
            </Link>
            <a className="btn btn-primary btn-sm" href="#pricing">
              {t.nav.viewPlans}
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="sec hero draw" id="top" aria-labelledby="hero-title">
          <div className="wrap">
            <div className="sec-mark" aria-hidden="true">
              <span className="hero-date">{fill(t.hero.margin, { days: daysSummary(blocks, locale, { short: true }) })}</span>
            </div>
            <div className="sec-body hero-grid">
              <div>
                <p className="kicker">
                  {t.hero.kicker.map((part, i) => (
                    <span key={part}>
                      {i > 0 && " · "}
                      {part}
                    </span>
                  ))}
                </p>
                <h1 id="hero-title">
                  {t.hero.titleLead}
                  <em>
                    {t.hero.titleEm}
                    <Underline />
                  </em>
                </h1>
                <p className="lede">{t.hero.lede}</p>
                <div className="hero-cta">
                  <a className="btn btn-primary" href="#pricing">
                    {t.hero.primary} <span className="arr" aria-hidden="true">→</span>
                  </a>
                  <a className="link" href="#how">
                    {t.hero.secondary}
                  </a>
                </div>
                <LiveStatus copy={t.live} locale={locale} blocks={blocks} />
              </div>

              <figure className="sheet" aria-label={reportCard.sampleTitle}>
                <figcaption className="sheet-head">
                  <span>{reportCard.sampleTitle}</span>
                  <span>{fill(t.report.sent, { time: sampleReports(firstBlock).attended.sent[locale] })}</span>
                </figcaption>
                <div className="ruled">
                  <ReportLines block={firstBlock} variant="attended" lang={locale} t={reportCard} circled />
                </div>
              </figure>
            </div>
          </div>
        </section>

        {/* 1. How it works */}
        <Section id="how" n={1} label={t.how.label} title={t.how.title}>
          <p className="intro">{t.how.intro}</p>
          <ol className="steps">
            {t.how.steps.map((step, i) => (
              <li className="step" key={step.title}>
                <span className="step-k">({"abcd"[i]})</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* 2. A session */}
        <Section id="session" n={2} label={t.session.label} title={t.session.title}>
          <p className="intro">{fill(t.session.intro, when)}</p>
          <div className="tl">
            <div className="tl-track">
              <ol className="tl-bar" aria-label={fill(t.session.timelineLabel, { from: clock(span.from), to: clock(span.to) })}>
                {segments.map((seg, i) => (
                  <li key={i} className={`tl-seg tl-${seg.kind}`} style={{ "--m": seg.to - seg.from } as React.CSSProperties}>
                    {seg.kind === "study" && (
                      <>
                        <span className="l" aria-hidden="true">
                          {fill(t.session.study, { m: seg.to - seg.from })}
                        </span>
                        <span className="s" aria-hidden="true">
                          {fill(t.session.studyShort, { m: seg.to - seg.from })}
                        </span>
                      </>
                    )}
                    <span className="vh">{fill(t.session.segment[seg.kind], { from: clock(seg.from), to: clock(seg.to) })}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="tl-ticks" aria-hidden="true">
              {ticks.map((m) => (
                <span key={m} style={{ "--x": tickAt(m) } as React.CSSProperties}>
                  {formatClock(m, locale, { suffix: false })}
                </span>
              ))}
            </div>
            <div className="tl-key" aria-hidden="true">
              <span>
                <i className="k-study" />
                {t.session.key.study}
              </span>
              <span>
                <i className="k-break" />
                {t.session.key.break}
              </span>
              <span>
                <i className="k-goals" />
                {t.session.key.goals}
              </span>
            </div>
            <ol className="tl-notes">
              {[
                { time: clock(span.from), ...t.session.notes.doors },
                {
                  time: formatRange(studies[0].from, studies.at(-1)!.to, locale),
                  title: fill(t.session.notes.blocks.title, { block: firstBlock.blockMinutes, break: firstBlock.breakMinutes }),
                  body: fill(t.session.notes.blocks.body, { n: studies.length }),
                },
                { time: clock(wrapup.from), ...t.session.notes.wrapup },
                t.session.notes.after,
              ].map((n) => (
                <li key={n.title}>
                  <time>{n.time}</time>
                  <b>{n.title}</b>
                  <p>{n.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        {/* 3. What parents receive */}
        <Section id="report" n={3} label={t.report.label} title={t.report.title}>
          <p className="intro">{t.report.intro}</p>
          <div className="report-grid">
            <div className="report-col">
              {/* Both languages go to the browser so the sample can switch without a reload. */}
              <SampleReport
                block={firstBlock}
                copies={{ en: en.landing.report, zh: zh.landing.report }}
                labels={{ en: en.reportCard, zh: zh.reportCard }}
                initialLang={locale}
              />
            </div>
            <div>
              <ol className="legend">
                {t.report.legend.map((item, i) => (
                  <li key={item.title}>
                    <span className="anno" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div>
                      <b>{item.title}</b>
                      <p>{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="aside-block">
                <h3>{t.report.neverTitle}</h3>
                <p>{t.report.never}</p>
              </div>
              <div className="aside-block">
                <h3>{t.report.deliveryTitle}</h3>
                <p>{t.report.delivery}</p>
              </div>
            </div>
          </div>
        </Section>

        {/* 4. Alongside tutoring */}
        <Section id="tutoring" n={4} label={t.tutoring.label} title={t.tutoring.title}>
          <div className="tutor-body">
            {t.tutoring.body.map((p) => (
              <p key={p}>
                <Rich text={p} />
              </p>
            ))}
          </div>
          <div className="scope" aria-labelledby="scope-title">
            <h3 id="scope-title">{helpScope.title}</h3>
            <div className="scope-grid">
              {(["vce", "junior"] as const).map((stage) => (
                <div key={stage}>
                  <h4>{helpScope[`${stage}Label`]}</h4>
                  <ul>
                    {helpScope[stage].map((subject) => (
                      <li key={subject}>{subject}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="scope-note">{helpScope.note}</p>
          </div>
          <div className="is-grid">
            <div>
              <h3>{t.tutoring.is.title}</h3>
              <ul>
                {t.tutoring.is.items.map((item) => (
                  <li key={item}>
                    <Tick />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="not">
              <h3>{t.tutoring.isNot.title}</h3>
              <ul>
                {t.tutoring.isNot.items.map((item) => (
                  <li key={item}>
                    <Cross />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* 5. House rules */}
        <Section id="rules" n={5} label={t.rules.label} title={t.rules.title}>
          <p className="intro">{t.rules.intro}</p>
          <div className="sheet rules-sheet">
            <ol className="rules">
              {t.rules.items.map((rule, i) => (
                <li key={rule}>
                  <span className="n">{i + 1}</span>
                  <span>
                    <Rich text={rule} />
                  </span>
                </li>
              ))}
            </ol>
            <div className="rules-foot">
              <span>{t.rules.foot}</span>
              <Link className="link" href={localizePath("/legal/house-rules", locale)}>
                {t.rules.fullLink}
              </Link>
            </div>
          </div>
        </Section>

        {/* 6. Safety & privacy */}
        <Section id="safety" n={6} label={t.safety.label} title={t.safety.title} className="cover">
          <p className="intro">{t.safety.intro}</p>
          <ul className="safety">
            {t.safety.items.map((item, i) => (
              <li key={item.title}>
                <span className="k">{String(i + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
          <div className="cover-foot">
            <span>{t.safety.foot}</span>
            <Link className="link" href={localizePath("/legal/privacy", locale)}>
              {t.safety.privacyLink}
            </Link>
            <span>
              {t.safety.contact.split("{email}")[0]}
              {mailto}
            </span>
          </div>
        </Section>

        {/* 7. Pricing */}
        <Section id="pricing" n={7} label={t.pricing.label} title={t.pricing.title} aside={<PlanCards copy={t.pricing} times={when.times} signUpHref={localizePath("/onboarding", locale)} />}>
          <p className="intro">{fill(t.pricing.intro, when)}</p>
          <ul className="checks">
            {t.pricing.checks.map((check) => (
              <li key={check}>
                <Tick />
                <span>{check}</span>
              </li>
            ))}
          </ul>
          <PlanComparison copy={t.pricing.compare} />
        </Section>

        {/* 8. FAQ */}
        <Section id="faq" n={8} label={t.faq.label} title={t.faq.title}>
          <div className="faq">
            {t.faq.items.map((item) => (
              <details key={item.id}>
                <summary>
                  {item.q}
                  <span className="pm" aria-hidden="true" />
                </summary>
                <div className="ans">
                  {item.a.map((p) => (
                    <p key={p}>{fill(p, faqValues)}</p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Section>

        {/* Closing call to action */}
        <section className="sec end draw" aria-labelledby="end-title">
          <div className="wrap">
            <div className="sec-mark" aria-hidden="true">
              <Tick />
            </div>
            <div className="sec-body">
              <h2 id="end-title">{t.end.title}</h2>
              <div className="hero-cta">
                <a className="btn btn-primary" href="#pricing">
                  {t.end.primary} <span className="arr" aria-hidden="true">→</span>
                </a>
                <a className="link" href="#faq">
                  {t.end.secondary}
                </a>
              </div>
              <LiveStatus copy={t.live} locale={locale} blocks={blocks} />
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <div className="sec-mark" aria-hidden="true" />
          <div className="sec-body">
            <div className="foot-grid">
              <div>
                <Link className="brand" href={localizePath("/", locale)}>
                  Study Hall
                  <Tick />
                </Link>
                <p className="foot-small">{t.footer.tagline}</p>
                <p className="foot-small">
                  {t.footer.contact}: {mailto}
                </p>
              </div>
              <nav aria-label={t.footer.nav}>
                <a href="#rules">{t.footer.houseRules}</a>
                <a href="#safety">{t.footer.safety}</a>
                <Link href={localizePath("/legal/privacy", locale)}>{t.footer.privacy}</Link>
                <Link href={localizePath("/login", locale)}>{t.footer.logIn}</Link>
                <LanguageSwitch locale={locale} />
              </nav>
            </div>
          </div>
        </div>
      </footer>

      <LandingEffects />
    </div>
  );
}

/** A numbered section with the margin column. With `aside`, the body becomes two columns (pricing). */
function Section({
  id,
  n,
  label,
  title,
  className = "",
  aside,
  children,
}: {
  id: string;
  n: number;
  label: string;
  title: string;
  className?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const main = (
    <>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </>
  );
  return (
    <section className={`sec ${className}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="wrap">
        <div className="sec-mark" aria-hidden="true">
          <span className="sec-num">{n}.</span>
          <span className="sec-label">{label}</span>
        </div>
        {aside ? (
          <div className="sec-body price-grid">
            <div>{main}</div>
            {aside}
          </div>
        ) : (
          <div className="sec-body">{main}</div>
        )}
      </div>
    </section>
  );
}
