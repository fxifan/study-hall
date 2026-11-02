import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LlmError, llmConfigured, openAiLlm } from "@/lib/llm";
import { generateReport } from "@/lib/report/generate";
import { langsFor, type Draft, type FamilyReportLang } from "@/lib/report/schema";
import { logUsage } from "./server";

/**
 * Draft (or re-draft) a report from the source text already saved on it. The transcript is saved
 * before the model is called, so a failed draft never loses the tutor's note (the audio is gone).
 */
export async function draftReport(
  supabase: SupabaseClient,
  tutorId: string,
  reportId: string,
): Promise<{ ok: true; draft: Draft } | { ok: false; error: string }> {
  const { data: report, error } = await supabase
    .from("tutor_reports")
    .select(
      "id, transcript, sent_at, tutor_sessions!inner(duration_min, subjects, tutor_students!inner(first_name, year_level, tutor_families!inner(report_lang)))",
    )
    .eq("id", reportId)
    .single<{
      id: string;
      transcript: string | null;
      sent_at: string | null;
      tutor_sessions: {
        duration_min: number;
        subjects: string[];
        tutor_students: { first_name: string; year_level: number; tutor_families: { report_lang: FamilyReportLang } };
      };
    }>();
  if (error || !report) return { ok: false, error: "Report not found." };
  if (report.sent_at) return { ok: false, error: "This report has already been sent." };

  const session = report.tutor_sessions;
  const student = session.tutor_students;
  const langs = langsFor(student.tutor_families.report_lang);

  let draft: Draft;
  try {
    const llm = llmConfigured() ? openAiLlm() : offlineLlm();
    const result = await generateReport(
      {
        note: report.transcript ?? "",
        studentFirstName: student.first_name,
        subjects: session.subjects,
        durationMin: session.duration_min,
        yearLevel: student.year_level,
        langs,
      },
      llm,
    );
    if (result.tokens > 0) await logUsage(tutorId, "llm_tokens", result.tokens);
    draft = result.draft;
  } catch (e) {
    console.error("Report draft failed", e instanceof LlmError ? e.message : e);
    return { ok: false, error: "Couldn't draft the report. Your note is saved: try again, or write the report yourself." };
  }

  const { error: saveError } = await supabase
    .from("tutor_reports")
    .update({ draft_json: draft, final_json: draft.body, sensitive_omitted: draft.sensitive, langs })
    .eq("id", reportId);
  if (saveError) return { ok: false, error: "Couldn't save the draft." };
  return { ok: true, draft };
}

/**
 * Local development without OPENAI_API_KEY: a stand-in that puts the note's sentences under
 * "Covered", quoting each one, so the whole flow (grounding included) can be clicked through.
 * Never used when a key is set.
 */
function offlineLlm() {
  if (process.env.VERCEL_ENV === "production") throw new LlmError("OPENAI_API_KEY is not set.");
  return {
    async json(request: { schemaName: string; user: string }) {
      if (request.schemaName === "session_report_zh") {
        const source = JSON.parse(request.user.slice(request.user.indexOf("{")));
        const tag = (s: string) => `【未翻译】${s}`;
        return {
          data: {
            covered: source.covered.map(tag),
            went_well: source.went_well.map(tag),
            next_focus: source.next_focus.map(tag),
            homework: source.homework.map(tag),
            tutor_note: source.tutor_note ? tag(source.tutor_note) : "",
          },
          tokens: 0,
          model: "offline",
        };
      }
      const note = /<<<NOTE\n([\s\S]*)\nNOTE>>>/.exec(request.user)?.[1] ?? "";
      const sentences = note.split(/(?<=[.!?。！？])\s*/).map((s) => s.trim()).filter((s) => s.length > 3).slice(0, 5);
      return {
        data: {
          covered: sentences.map((s) => ({ text: s.replace(/[.。]$/, ""), quote: s })),
          went_well: [],
          next_focus: [],
          homework: [],
          tutor_note: null,
          sensitive: false,
        },
        tokens: 0,
        model: "offline",
      };
    },
  };
}

