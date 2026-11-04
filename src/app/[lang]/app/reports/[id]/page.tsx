import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { langsFor, type Draft, type FamilyReportLang, type ReportBody } from "@/lib/report/schema";
import type { ReportMeta } from "@/lib/report/render";
import { createClient } from "@/lib/supabase/server";
import { sessionWhen, shortWhen, studentName } from "@/lib/tutor/format";
import { tutorEmailMode } from "@/lib/email/send";
import { requireTutor } from "@/lib/tutor/server";
import { formatInZone } from "@/lib/time";
import { Loading, Notice, TutorShell, appHref, secondaryButton } from "../../_components/shell";
import { deleteTranscript, redraft } from "../actions";
import { ReportEditor } from "./report-editor";

export const metadata: Metadata = { title: "Session report" };

export default function ReportPage({ params, searchParams }: PageProps<"/[lang]/app/reports/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Report params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Row = {
  id: string;
  source: "voice" | "typed";
  transcript: string | null;
  draft_json: Draft | null;
  final_json: ReportBody | null;
  sensitive_omitted: boolean;
  langs: string[];
  sent_at: string | null;
  sent_to: string | null;
  tutor_sessions: {
    starts_at: string;
    duration_min: number;
    subjects: string[];
    tutor_students: {
      id: string;
      first_name: string;
      last_initial: string;
      tutor_families: { parent_email: string; report_lang: FamilyReportLang };
    };
  };
};

async function Report({ params, searchParams }: Pick<PageProps<"/[lang]/app/reports/[id]">, "params" | "searchParams">) {
  const [me, locale, { id }, query] = await Promise.all([requireTutor(), getLocale(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: r } = await (await createClient())
    .from("tutor_reports")
    .select(
      "id, source, transcript, draft_json, final_json, sensitive_omitted, langs, sent_at, sent_to, tutor_sessions!inner(starts_at, duration_min, subjects, tutor_students!inner(id, first_name, last_initial, tutor_families!inner(parent_email, report_lang)))",
    )
    .eq("id", id)
    .maybeSingle<Row>();
  if (!r) notFound();

  const session = r.tutor_sessions;
  const student = session.tutor_students;
  const family = student.tutor_families;
  const langs = r.sent_at ? (r.langs as ("en" | "zh-CN")[]) : langsFor(family.report_lang);
  const meta: ReportMeta = {
    student: studentName(student),
    ...sessionWhen(session.starts_at, session.duration_min),
    subjects: session.subjects,
    tutorName: me.tutor.display_name,
    brand: me.tutor.business_name || me.tutor.display_name,
  };
  const draft = r.draft_json;

  return (
    <TutorShell
      tutor={me}
      title={`${studentName(student)} · ${shortWhen(session.starts_at)}`}
      back={{ href: `/app/students/${student.id}`, label: studentName(student) }}
    >
      {query.error === "draft" && <Notice tone="error">Couldn&apos;t draft the report. Your note is saved: try again, or write it yourself.</Notice>}
      {query.error === "blocked" && <Notice tone="error">Drafting is paused on your plan. See Settings.</Notice>}
      {query.saved === "redrafted" && <Notice>Drafted again from your note.</Notice>}
      {query.saved === "transcript" && <Notice>Transcript deleted.</Notice>}

      {!r.sent_at && !draft && (
        <Notice tone="error">
          This report hasn&apos;t been drafted yet (the drafting service didn&apos;t answer). Your note is saved.
        </Notice>
      )}
      {r.sensitive_omitted && (
        <aside className="rounded-md border border-pen bg-sheet px-3 py-2 text-sm" role="note">
          <strong className="text-pen">Private to you:</strong> your note mentioned something about wellbeing or safety. It was left out of the
          parent report. Nothing has been sent or reported anywhere.{" "}
          <Link className="underline" href={appHref("/app/guidance", locale)}>
            What to do next
          </Link>
        </aside>
      )}
      {!r.sent_at && draft?.tooShort && (
        <Notice>Your note was too short to draft from, so nothing was filled in. Add the details below, or log the note again.</Notice>
      )}
      {!r.sent_at && draft && draft.dropped > 0 && (
        <Notice>
          {draft.dropped} suggested {draft.dropped === 1 ? "item was" : "items were"} left out because they weren&apos;t in your note or broke the
          report rules (no labels, comparisons or mark predictions). Add anything that&apos;s missing.
        </Notice>
      )}

      <ReportEditor
        reportId={r.id}
        initial={r.final_json ?? draft?.body ?? {}}
        langs={langs}
        meta={meta}
        parentEmail={family.parent_email}
        emailMode={tutorEmailMode()}
        sent={r.sent_at ? { at: formatInZone(r.sent_at, "d MMM yyyy, h:mmaaa"), to: r.sent_to ?? "" } : null}
      />

      <details className="dash-card px-4 py-3 text-sm">
        <summary className="cursor-pointer">Your {r.source === "voice" ? "transcript" : "notes"} (private)</summary>
        {r.transcript ? (
          <>
            <p className="mt-3 whitespace-pre-wrap text-ink-soft">{r.transcript}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!r.sent_at && (
                <form action={redraft}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className={secondaryButton}>
                    {draft ? "Draft again (replaces your edits)" : "Draft now"}
                  </button>
                </form>
              )}
              <form action={deleteTranscript}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className={secondaryButton}>
                  Delete transcript
                </button>
              </form>
            </div>
          </>
        ) : (
          <p className="mt-3 text-ink-faint">Deleted. Voice recordings are never kept.</p>
        )}
      </details>
    </TutorShell>
  );
}
