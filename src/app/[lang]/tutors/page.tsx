import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, FileText, Languages, MessageSquareQuote, Mic, PenLine, ReceiptText, ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { MONTHLY_DRAFT_CAP, PLANS, TUTOR_PRODUCT_NAME } from "@/lib/tutor/config";
import { formatCents } from "@/lib/tutor/invoice-math";
import { SAMPLE_META, SAMPLE_TEXT_EN, SAMPLE_TEXT_ZH } from "@/lib/tutor/sample";
import { DemoVideo } from "./demo-video";
import { SignUpForm } from "./signup-form";
import "./tutors.css";

export const metadata: Metadata = {
  title: { absolute: `${TUTOR_PRODUCT_NAME}: parent updates in 60 seconds` },
  description: "Speak for a minute after each session. Get a factual parent update in English or 中文, the session logged, and the invoice done.",
};

/** The recorded product walkthrough (tests/e2e/demo-recording.spec.ts), served from /public/media. */
const DEMO = {
  src: "/media/edumi-for-tutors-demo.webm",
  poster: "/media/edumi-for-tutors-demo-poster.jpg",
  /** Original background music composed for the demo (no third-party licence involved). */
  music: "/media/edumi-for-tutors-demo-music.m4a",
};

const BENEFITS = [
  { icon: Languages, title: "English, 中文 or both", body: "Simplified Chinese, English, or both side by side, ready to paste into WeChat or WhatsApp." },
  { icon: MessageSquareQuote, title: "Only what you said", body: "No labels, no comparisons, no invented praise. The draft sticks to your note." },
  { icon: PenLine, title: "You check every word", body: "Nothing reaches a parent until you've reviewed, edited and sent it." },
  { icon: ReceiptText, title: "Sessions and invoices", body: "Every session is logged. Invoices or tax invoices (GST or not), with your bank details." },
];

const STEPS = [
  { icon: CalendarCheck, title: "Log a session", body: "Tap “Log a session”. The student, date and time are filled in." },
  { icon: Mic, title: "Speak for a minute", body: "What you covered, how they went, what's next, any homework." },
  { icon: PenLine, title: "Review and send", body: "Check the English and/or 中文 draft side by side, edit anything, then send." },
  { icon: FileText, title: "Invoice in two taps", body: "At month's end, turn unbilled sessions into an invoice." },
];

export default async function TutorsLanding() {
  const locale = await getLocale();
  const href = (p: string) => localizePath(p, locale);
  const solo = formatCents(PLANS.solo.priceCentsPerMonth).replace(".00", "");

  return (
    <div className="tl" lang="en">
      <a className="tl-skip" href="#main">
        Skip to content
      </a>
      <header className="tl-nav">
        <div className="tl-wrap tl-nav-in">
          <Link href={href("/tutors")} className="tl-brand" aria-label={`${TUTOR_PRODUCT_NAME} home`}>
            <Wordmark product="for tutors" />
          </Link>
          <nav aria-label="Page" className="tl-nav-links">
            <a href="#how">How it works</a>
            <a href="#demo">Demo</a>
            <a href="#pricing">Pricing</a>
            <Link href={href("/")}>Edumi</Link>
          </nav>
          <Link href={href("/login")} className="tl-btn tl-btn--ghost tl-nav-login">
            Log in
          </Link>
          <details className="tl-menu">
            <summary>Menu</summary>
            <nav aria-label="Page (menu)">
              <a href="#how">How it works</a>
              <a href="#demo">Demo</a>
              <a href="#pricing">Pricing</a>
              <Link href={href("/")}>Edumi home</Link>
              <Link href={href("/login")}>Log in</Link>
            </nav>
          </details>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="tl-hero" aria-labelledby="tl-title">
          <div className="tl-wrap tl-hero-grid">
            <div className="tl-hero-copy">
              <p className="tl-eyebrow">For independent tutors in Australia</p>
              <h1 id="tl-title">Parent updates in 60 seconds.</h1>
              <p className="tl-lede">
                After a lesson, speak for a minute. Edumi turns it into a short, factual parent update, ready to email or paste into WeChat.
                The session is logged for the family&apos;s next invoice.
              </p>
              <div className="tl-cta">
                <a href="#signup" className="tl-btn tl-btn--primary">
                  Start your 14-day free trial
                </a>
                <a href="#demo" className="tl-btn tl-btn--secondary">
                  <span className="tl-play" aria-hidden="true" /> Watch the demo
                </a>
              </div>
              <p className="tl-fine">No card needed · Then {solo}/month · Cancel any time</p>
            </div>

            {/* Preview: a real frame from the demo recording, linking to the video. */}
            <a href="#demo" className="tl-preview" aria-label="Watch the demo: logging a lesson and checking the AI draft">
              <span className="tl-preview-bar" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element -- static poster frame from the recording */}
              <img src={DEMO.poster} alt="" width={1280} height={800} fetchPriority="high" />
              <span className="tl-preview-play" aria-hidden="true">
                <span />
              </span>
            </a>
          </div>
        </section>

        {/* Benefits */}
        <section className="tl-section tl-section--tight" aria-label="What you get">
          <ul className="tl-wrap tl-benefits">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <span className="tl-icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <h2>{title}</h2>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Demo */}
        <section id="demo" className="tl-section" aria-labelledby="demo-title">
          <div className="tl-wrap tl-narrow">
            <p className="tl-label">Demo</p>
            <h2 id="demo-title" className="tl-h2">
              See a real lesson go from note to parent update.
            </h2>
            <figure className="tl-video">
              <DemoVideo src={DEMO.src} poster={DEMO.poster} music={DEMO.music} captionId="demo-caption" />
              <figcaption id="demo-caption">
                A real run of {TUTOR_PRODUCT_NAME}, about 40 seconds, with background music: a tutor logs a maths lesson with a typed note (a voice note
                works the same way), checks the AI draft, sends it from their own email, and creates the invoice. The student and family are
                fictional.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="tl-section tl-section--tint" aria-labelledby="how-title">
          <div className="tl-wrap">
            <p className="tl-label">How it works</p>
            <h2 id="how-title" className="tl-h2">
              Four steps, most of them under a minute.
            </h2>
            <ol className="tl-steps">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title}>
                  <span className="tl-step-n" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="tl-icon" aria-hidden="true">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Sample */}
        <section className="tl-section" aria-labelledby="sample-title">
          <div className="tl-wrap">
            <p className="tl-label">What the parent gets</p>
            <h2 id="sample-title" className="tl-h2">
              One update, in the family&apos;s language.
            </h2>
            <p className="tl-sub">
              A fictional example ({SAMPLE_META.student}, {SAMPLE_META.subjects[0]}), as it would be pasted into WeChat. Families can get
              English, Simplified Chinese, or both.
            </p>
            <div className="tl-sample">
              <figure lang="en">
                <figcaption>
                  <span className="tl-flag">EN</span> English
                </figcaption>
                <pre>{SAMPLE_TEXT_EN}</pre>
              </figure>
              <figure lang="zh-CN">
                <figcaption>
                  <span className="tl-flag">中</span> 简体中文
                </figcaption>
                <pre>{SAMPLE_TEXT_ZH}</pre>
              </figure>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="tl-section tl-section--tint" aria-labelledby="pricing-title">
          <div className="tl-wrap">
            <p className="tl-label">Pricing</p>
            <h2 id="pricing-title" className="tl-h2">
              Simple, in Australian dollars.
            </h2>
            <div className="tl-prices tl-prices--one">
              <article className="tl-price tl-price--main">
                <h3>{PLANS.solo.name}</h3>
                <p className="tl-amount">
                  <span className="tl-struck">
                    {solo}
                    <span>/month</span>
                  </span>
                  <span className="tl-sr"> (free for the first {PLANS.trial.days} days)</span>
                </p>
                <p className="tl-free" aria-hidden="true">
                  First {PLANS.trial.days} days free
                </p>
                <ul>
                  <li>Unlimited students, reports and invoices</li>
                  <li>Fair use: {MONTHLY_DRAFT_CAP} AI drafts a month</li>
                  <li>No card needed for the trial · cancel any time</li>
                </ul>
                <a href="#signup" className="tl-btn tl-btn--primary">
                  Start your free trial
                </a>
              </article>
            </div>
            <p className="tl-fine tl-center">Families pay you directly by bank transfer. We never hold your money. Prices in AUD.</p>
          </div>
        </section>

        {/* Sign-up */}
        <section className="tl-section" aria-labelledby="signup-title">
          <div className="tl-wrap tl-signup">
            <div>
              <p className="tl-label">Get started</p>
              <h2 id="signup-title" className="tl-h2">
                Start your 14-day free trial.
              </h2>
              <p className="tl-sub">We&apos;ll email you a sign-in link. No password, no card.</p>
              <div className="tl-privacy">
                <span className="tl-icon" aria-hidden="true">
                  <ShieldCheck size={18} strokeWidth={2} />
                </span>
                <p>
                  <strong>Privacy, built in.</strong> Data is stored in Australia (Sydney). Voice notes are deleted as soon as they&apos;re
                  transcribed. Students are recorded by first name, last initial and year level only. Anything a note says about wellbeing or
                  safety is kept out of parent reports and shown only to you.
                </p>
              </div>
            </div>
            <div className="tl-form-card">
              <SignUpForm termsHref={href("/tutors/terms")} privacyHref={href("/tutors/privacy")} loginHref={href("/login")} />
            </div>
          </div>
        </section>
      </main>

      <footer className="tl-foot">
        <div className="tl-wrap tl-foot-in">
          <div>
            <Wordmark product="for tutors" />
            <p>Parent updates, sessions and invoices for independent tutors.</p>
          </div>
          <nav aria-label="Footer">
            <Link href={href("/")}>Edumi home</Link>
            <Link href={href("/study_hall")}>Edumi Study Hall</Link>
            <Link href={href("/tutors/privacy")}>Privacy</Link>
            <Link href={href("/tutors/terms")}>Terms</Link>
            <Link href={href("/login")}>Log in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
