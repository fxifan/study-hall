"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { LlmError, llmConfigured, openAiLlm } from "@/lib/llm";
import { translateReport } from "@/lib/report/generate";
import { reportEmail, type ReportMeta } from "@/lib/report/render";
import { isEmptyContent, langsFor, reportBodySchema, reportContentSchema, type FamilyReportLang, type ReportBody } from "@/lib/report/schema";
import { EmailError, sendEmail, tutorEmailMode } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";
import { draftReport } from "@/lib/tutor/drafting";
import { sessionWhen, studentName } from "@/lib/tutor/format";
import { canWork } from "@/lib/tutor/plan";
import { accessFor, logUsage } from "@/lib/tutor/server";
import { blockedMessage } from "../_components/plan-banner";
import { back, requireTutorAction } from "../_lib/action-helpers";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

type ReportRow = {
  id: string;
  sent_at: string | null;
  langs: string[];
  tutor_sessions: {
    starts_at: string;
    duration_min: number;
    subjects: string[];
    tutor_students: {
      first_name: string;
      last_initial: string;
      tutor_families: { parent_email: string; report_lang: FamilyReportLang };
    };
  };
};

async function loadReport(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tutor_reports")
    .select(
      "id, sent_at, langs, tutor_sessions!inner(starts_at, duration_min, subjects, tutor_students!inner(first_name, last_initial, tutor_families!inner(parent_email, report_lang)))",
    )
    .eq("id", id)
    .maybeSingle<ReportRow>();
  return { supabase, report: data };
}

const idSchema = z.uuid();

/** Save the tutor's edits (not sent). */
export async function saveReport(id: string, body: ReportBody): Promise<ActionResult> {
  await requireTutorAction();
  const parsedId = idSchema.safeParse(id);
  const parsed = reportBodySchema.safeParse(body);
  if (!parsedId.success || !parsed.success) return { ok: false, error: "Some items are too long or empty. Check and try again." };
  const { supabase, report } = await loadReport(parsedId.data);
  if (!report) return { ok: false, error: "Report not found." };
  if (report.sent_at) return { ok: false, error: "This report has already been sent." };
  const { error } = await supabase.from("tutor_reports").update({ final_json: parsed.data }).eq("id", report.id);
  return error ? { ok: false, error: "Couldn't save." } : { ok: true, message: "Saved." };
}

/** Re-translate the Chinese version from the (edited) English one. */
export async function translateAgain(id: string, en: unknown): Promise<ActionResult & { zh?: unknown }> {
  const me = await requireTutorAction();
  const access = await accessFor(me.tutor);
  if (!access.ok) return { ok: false, error: blockedMessage(access.reason) };
  const content = reportContentSchema.safeParse(en);
  if (!idSchema.safeParse(id).success || !content.success) return { ok: false, error: "Check the English version first." };
  if (!llmConfigured() && process.env.VERCEL_ENV === "production") return { ok: false, error: "Translation isn't set up." };
  try {
    if (!llmConfigured()) return { ok: true, zh: { ...content.data }, message: "No translation service in development: English copied." };
    const result = await translateReport(content.data, openAiLlm());
    if (result.tokens) await logUsage(me.profile.id, "llm_tokens", result.tokens);
    return { ok: true, zh: result.content, message: "Translated. Check it before sending." };
  } catch (e) {
    console.error("Translation failed", e instanceof LlmError ? e.message : e);
    return { ok: false, error: "Couldn't translate. Try again, or edit the Chinese yourself." };
  }
}

/** Draft again from the saved note (replaces unsent edits). */
export async function redraft(formData: FormData) {
  const me = await requireTutorAction();
  const id = idSchema.parse(formData.get("id"));
  const access = await accessFor(me.tutor);
  if (!access.ok) return back(`/app/reports/${id}`, "?error=blocked");
  const result = await draftReport(await createClient(), me.profile.id, id);
  return back(`/app/reports/${id}`, result.ok ? "?saved=redrafted" : "?error=draft");
}

/** Email the report to the parent, in the family's language(s). Never automatic (spec §3.3). */
export async function sendReport(id: string, body: ReportBody): Promise<ActionResult> {
  const me = await requireTutorAction();
  if (!canWork({ plan: me.tutor.plan, trialEndsAt: me.tutor.trial_ends_at })) return { ok: false, error: blockedMessage("trial_ended") };
  const parsed = reportBodySchema.safeParse(body);
  if (!idSchema.safeParse(id).success || !parsed.success) return { ok: false, error: "Some items are too long or empty." };
  if (tutorEmailMode() !== "app") return { ok: false, error: "Sending from Study Hall isn't set up. Use \"Open in my email\"." };
  const { supabase, report } = await loadReport(id);
  if (!report) return { ok: false, error: "Report not found." };
  if (report.sent_at) return { ok: false, error: "This report has already been sent." };

  const session = report.tutor_sessions;
  const student = session.tutor_students;
  const family = student.tutor_families;
  const langs = langsFor(family.report_lang);
  const final: ReportBody = Object.fromEntries(langs.map((l) => [l, parsed.data[l]]).filter(([, c]) => c));
  if (langs.some((l) => !final[l] || isEmptyContent(final[l]!))) {
    return { ok: false, error: langs.length > 1 ? "Fill in both languages before sending." : "The report is empty." };
  }

  const meta: ReportMeta = {
    student: studentName(student),
    ...sessionWhen(session.starts_at, session.duration_min),
    subjects: session.subjects,
    tutorName: me.tutor.display_name,
    brand: me.tutor.business_name || me.tutor.display_name,
  };
  try {
    const result = await sendEmail({
      to: family.parent_email,
      email: reportEmail(final, meta, langs),
      fromName: me.tutor.display_name,
      replyTo: me.profile.email,
    });
    await logUsage(me.profile.id, "email", 1);
    const { error } = await supabase
      .from("tutor_reports")
      .update({ final_json: final, sent_at: new Date().toISOString(), sent_to: family.parent_email, langs })
      .eq("id", report.id);
    if (error) return { ok: false, error: "Sent, but couldn't record it. Refresh the page." };
    refresh();
    return { ok: true, message: result.delivered ? `Sent to ${family.parent_email}.` : `Saved as sent (test mode: email written to email-previews/outbox).` };
  } catch (e) {
    console.error("Report email failed", e instanceof EmailError ? e.message : e);
    return { ok: false, error: "Couldn't send the email. Nothing was sent; try again." };
  }
}

/**
 * The tutor sent it themselves: pasted into WeChat/WhatsApp ("text"), or from their own email app
 * ("email"). Records the final version as sent so history shows it.
 */
export async function markShared(id: string, body: ReportBody, via: "text" | "email" = "text"): Promise<ActionResult> {
  await requireTutorAction();
  const parsed = reportBodySchema.safeParse(body);
  if (!idSchema.safeParse(id).success || !parsed.success) return { ok: false, error: "Some items are too long or empty." };
  const { supabase, report } = await loadReport(id);
  if (!report || report.sent_at) return { ok: false, error: "Already sent." };
  const family = report.tutor_sessions.tutor_students.tutor_families;
  const langs = langsFor(family.report_lang);
  const final: ReportBody = Object.fromEntries(langs.map((l) => [l, parsed.data[l]]).filter(([, c]) => c));
  if (langs.some((l) => !final[l] || isEmptyContent(final[l]!))) {
    return { ok: false, error: langs.length > 1 ? "Fill in both languages first." : "The report is empty." };
  }
  const { error } = await supabase
    .from("tutor_reports")
    .update({ final_json: final, sent_at: new Date().toISOString(), sent_to: via === "email" ? `${family.parent_email} (your email)` : "copied as text", langs })
    .eq("id", report.id);
  if (error) return { ok: false, error: "Couldn't save." };
  refresh();
  return { ok: true, message: via === "email" ? "Marked as sent." : "Marked as shared." };
}

export async function deleteTranscript(formData: FormData) {
  await requireTutorAction();
  const id = idSchema.parse(formData.get("id"));
  const { error } = await (await createClient()).from("tutor_reports").update({ transcript: null }).eq("id", id);
  return back(`/app/reports/${id}`, error ? "?error=transcript" : "?saved=transcript");
}
