import type { Metadata } from "next";
import Link from "next/link";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { reportText } from "@/lib/report/render";
import { MONTHLY_DRAFT_CAP, PLANS, TUTOR_PRODUCT_NAME } from "@/lib/tutor/config";
import { formatCents } from "@/lib/tutor/invoice-math";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: { absolute: `${TUTOR_PRODUCT_NAME}: parent updates in 60 seconds` },
  description: "Speak for a minute after each session. Get a factual parent update in English or 中文, the session logged, and the invoice done.",
};

/** A fictional example, rendered by the same code as real reports. */
const SAMPLE = reportText(
  {
    en: {
      covered: ["Chain rule and product rule (exercise 6B, Q1–12)", "Exam-style differentiation questions"],
      wentWell: ["All chain rule questions correct without help"],
      nextFocus: ["Choosing between product and quotient rule"],
      homework: ["Exercise 6B, Q13–20"],
      tutorNote: "The practice SAC is next Thursday.",
    },
    "zh-CN": {
      covered: ["链式法则和乘积法则（练习 6B，第1–12题）", "考试题型的求导练习"],
      wentWell: ["链式法则的题目全部独立做对"],
      nextFocus: ["判断何时用乘积法则、何时用商法则"],
      homework: ["练习 6B，第13–20题"],
      tutorNote: "模拟 SAC 在下周四。",
    },
  },
  {
    student: "Alex T.",
    date: { en: "Mon 2 Nov 2026", "zh-CN": "2026年11月2日 周一" },
    time: { en: "4:00pm–5:00pm", "zh-CN": "16:00–17:00" },
    subjects: ["Maths Methods"],
    tutorName: "Jamie",
    brand: "Jamie",
  },
);

export default async function TutorsLanding() {
  const locale = await getLocale();
  const href = (p: string) => localizePath(p, locale);
  return (
    <div className="flex flex-1 flex-col" lang="en">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <span className="font-mono text-xs tracking-widest text-pen uppercase">{TUTOR_PRODUCT_NAME}</span>
        <Link href={href("/login")} className="text-sm text-ink-soft hover:text-ink">
          Log in
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 pt-6 pb-16">
        <section className="grid items-start gap-10 md:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-5">
            <h1 className="text-4xl leading-tight font-medium tracking-tight sm:text-5xl">
              Parent updates in 60 seconds, in English or <span lang="zh-CN">中文</span>
            </h1>
            <p className="text-lg text-ink-soft">
              For independent tutors in Australia. After a session, speak for a minute. You get a short, factual update for the parent, ready
              to email or paste into WeChat or WhatsApp. The session is logged and goes on the family&apos;s next invoice.
            </p>
            <ul className="flex flex-col gap-1.5 text-ink-soft">
              <li>✓ English, Simplified Chinese, or both, side by side</li>
              <li>✓ Only what you said. No labels, no comparisons, no invented praise</li>
              <li>✓ You check every word before anything is sent</li>
              <li>✓ Invoices and tax invoices (GST or not) with your bank details</li>
            </ul>
          </div>
          <div className="rounded-xl border border-hair bg-sheet p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-medium">Start your 14-day free trial</h2>
            <SignUpForm termsHref={href("/tutors/terms")} privacyHref={href("/tutors/privacy")} loginHref={href("/login")} />
          </div>
        </section>

        <section aria-labelledby="demo" className="grid items-start gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 id="demo" className="text-2xl font-medium">
              How it works
            </h2>
            <ol className="flex list-decimal flex-col gap-2 pl-5">
              <li>Tap &quot;Log a session&quot;. The student, date and time are filled in.</li>
              <li>Talk for about a minute: what you covered, what went well, what&apos;s next, any homework.</li>
              <li>Check the draft (English and 中文 side by side), edit anything, tap Send.</li>
              <li>At the end of the month, turn unbilled sessions into an invoice in two taps.</li>
            </ol>
            {/* Demo GIF slot (spec §8). Replace with a short screen recording of the log → send flow. */}
            <div
              className="flex aspect-[9/16] max-h-96 items-center justify-center rounded-xl border border-dashed border-rule bg-paper-deep text-sm text-ink-faint"
              data-slot="demo-gif"
            >
              Demo video coming soon
            </div>
          </div>
          <figure className="flex flex-col gap-2">
            <figcaption className="text-sm text-ink-soft">What the parent gets (fictional example, as copied into WeChat):</figcaption>
            <pre className="rounded-xl border border-hair bg-sheet p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">{SAMPLE}</pre>
          </figure>
        </section>

        <section aria-labelledby="pricing" className="flex flex-col gap-4">
          <h2 id="pricing" className="text-2xl font-medium">
            Pricing
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-hair bg-sheet p-5">
              <h3 className="font-medium">{PLANS.trial.name}</h3>
              <p className="my-2 text-3xl">A$0</p>
              <p className="text-sm text-ink-soft">Everything, for {PLANS.trial.days} days. No card needed.</p>
            </div>
            <div className="rounded-xl border border-ink bg-sheet p-5">
              <h3 className="font-medium">{PLANS.solo.name}</h3>
              <p className="my-2 text-3xl">
                {formatCents(PLANS.solo.priceCentsPerMonth).replace(".00", "")}
                <span className="text-base text-ink-soft">/month</span>
              </p>
              <p className="text-sm text-ink-soft">
                Unlimited students, reports and invoices (fair use: {MONTHLY_DRAFT_CAP} AI drafts a month). Cancel any time.
              </p>
            </div>
          </div>
          <p className="text-xs text-ink-faint">
            Families pay you directly by bank transfer. We never hold your money. Prices in AUD.
          </p>
        </section>

        <section aria-labelledby="privacy" className="flex flex-col gap-2 text-sm text-ink-soft">
          <h2 id="privacy" className="text-lg font-medium text-ink">
            Privacy, built in
          </h2>
          <p>
            Data is stored in Australia (Sydney). Voice notes are deleted as soon as they&apos;re transcribed. Students are recorded by first name,
            last initial and year level only. Anything a note says about wellbeing or safety is kept out of parent reports and shown only to you.
          </p>
        </section>
      </main>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap gap-4 border-t border-rule px-4 py-6 text-sm text-ink-soft">
        <Link href={href("/tutors/privacy")}>Privacy</Link>
        <Link href={href("/tutors/terms")}>Terms</Link>
        <Link href={href("/")}>Study Hall</Link>
      </footer>
    </div>
  );
}
