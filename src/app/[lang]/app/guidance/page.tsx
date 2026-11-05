import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTutor } from "@/lib/tutor/server";
import { SUPPORT_EMAIL } from "@/lib/tutor/config";
import { Loading, TutorShell } from "../_components/shell";

export const metadata: Metadata = { title: "If a student tells you something worrying" };

/**
 * Linked from the private notice shown when a note mentions wellbeing or safety (spec §6).
 * DRAFT: founders to review with a child-safety adviser before launch. General information, not
 * legal advice; the app never escalates anything itself.
 */
export default function GuidancePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Guidance />
    </Suspense>
  );
}

async function Guidance() {
  const me = await requireTutor();
  return (
    <TutorShell tutor={me} title="If a student tells you something worrying" back={{ href: "/app", label: "Today" }}>
      <p role="note" className="rounded-md border border-dashed border-pen px-3 py-2 text-sm text-pen">
        Draft guidance, to be reviewed by Edumi&apos;s founders with a child-safety adviser before launch. General information only, not legal
        advice.
      </p>
      <div className="flex flex-col gap-4 leading-relaxed">
        <p>
          Your note mentioned wellbeing or safety, so it was left out of the parent report. Written reports aren&apos;t the right place for it.
          Edumi hasn&apos;t sent, stored for anyone else, or reported anything.
        </p>
        <h2 className="text-lg font-medium">If a child is in immediate danger</h2>
        <p>
          Call <strong>000</strong>.
        </p>
        <h2 className="text-lg font-medium">If you&apos;re worried about a child&apos;s safety</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Victoria: Child Protection (business hours, by area) or the after-hours Child Protection Emergency Service on <strong>13 12 78</strong>.
          </li>
          <li>
            New South Wales: Child Protection Helpline on <strong>13 21 11</strong>.
          </li>
          <li>Other states and territories have their own child protection lines; search your state government&apos;s website.</li>
        </ul>
        <h2 className="text-lg font-medium">If the student is struggling</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Kids Helpline (ages 5–25, 24/7): <strong>1800 55 1800</strong>.
          </li>
          <li>
            Lifeline (24/7): <strong>13 11 14</strong>.
          </li>
        </ul>
        <h2 className="text-lg font-medium">Good practice</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Listen, stay calm, and don&apos;t promise to keep a secret you might need to pass on.</li>
          <li>Write down what was said, in the student&apos;s words, with the date, and keep it private.</li>
          <li>
            Unless doing so could put the child at risk, talk to the parent directly (by phone or in person, not in the session report).
          </li>
          <li>If you&apos;re unsure, ask a child protection service for advice. You can delete the transcript from the report page.</li>
        </ul>
        <p className="text-sm text-ink-soft">Questions about this page: {SUPPORT_EMAIL}</p>
      </div>
    </TutorShell>
  );
}
