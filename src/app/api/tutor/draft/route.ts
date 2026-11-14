import { blockedMessage } from "@/lib/tutor/plan-messages";
import { track } from "@/lib/events";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from "@/lib/tutor/config";
import { draftReport } from "@/lib/tutor/drafting";
import { accessFor, currentTutor, logUsage } from "@/lib/tutor/server";
import { TranscribeError, transcribe } from "@/lib/transcribe";
import { zonedDateTimeToUtc } from "@/lib/time";

/**
 * POST /api/tutor/draft (multipart): log a session and draft its report (spec §3.3).
 * A Route Handler, not a Server Action, because a voice note can exceed Server Actions' 1 MB body.
 *
 *   1. Check the tutor, their plan and the fair-use cap.
 *   2. Transcribe the audio, if any. It's held in memory only and never stored (spec §6). If this
 *      fails nothing is saved, and the browser still has the recording to retry.
 *   3. Save the session and the transcript/notes.
 *   4. Draft the report. If that fails, the report page offers "Draft again".
 * Nothing is sent to the parent: the tutor reviews and taps Send on /app/reports/[id].
 */
export const maxDuration = 60;

const fields = z.object({
  studentId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.coerce.number().int().min(5).max(600),
  subjects: z
    .string()
    .max(400)
    .transform((v) => [...new Set(v.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 10).map((s) => s.slice(0, 40))),
  notes: z.string().max(5000),
  audioSeconds: z.coerce.number().min(0).max(MAX_AUDIO_SECONDS + 5).optional(),
  lessonId: z.uuid().optional(),
});

const fail = (status: number, error: string, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const me = await currentTutor();
  if (!me) return fail(401, "Please log in again.");
  const access = await accessFor(me.tutor);
  if (!access.ok) {
    return fail(
      402,
      blockedMessage(access.reason),
      { reason: access.reason },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "Couldn't read the upload.");
  }
  const parsed = fields.safeParse({
    studentId: formData.get("studentId"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    durationMin: formData.get("durationMin"),
    subjects: formData.get("subjects") ?? "",
    notes: formData.get("notes") ?? "",
    audioSeconds: formData.get("audioSeconds") ?? undefined,
    lessonId: formData.get("lessonId") || undefined,
  });
  if (!parsed.success) return fail(400, "Check the session details and try again.");
  const input = parsed.data;
  const audio = formData.get("audio");
  const hasAudio = audio instanceof Blob && audio.size > 0;
  if (hasAudio && audio.size > MAX_AUDIO_BYTES) return fail(413, "That recording is too long. Keep voice notes under 3 minutes.");
  if (!hasAudio && !input.notes.trim()) return fail(400, "Record a voice note or type a few notes first.");

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("tutor_students")
    .select("id, tutor_families!inner(rate_cents_override)")
    .eq("id", input.studentId)
    .maybeSingle<{ id: string; tutor_families: { rate_cents_override: number | null } }>();
  if (!student) return fail(404, "Student not found.");

  let transcript = "";
  if (hasAudio) {
    try {
      const type = audio.type || "audio/webm";
      const ext = type.includes("mp4") || type.includes("m4a") || type.includes("aac") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      await track({ name: "voice_note_uploaded", product: "tutors", role: "tutor", userId: me.profile.id, email: me.profile.email, props: { seconds: Math.round(input.audioSeconds ?? 0) } });
      transcript = await transcribe(audio, `note.${ext}`);
      await track({ name: "transcription_completed", product: "tutors", role: "tutor", userId: me.profile.id, email: me.profile.email, props: { seconds: Math.round(input.audioSeconds ?? 0) } });
    } catch (e) {
      await track({ name: "transcription_failed", product: "tutors", role: "tutor", userId: me.profile.id, email: me.profile.email, props: { error: e instanceof TranscribeError ? "transcribe_error" : "unknown" } });
      console.error("Transcription failed", e instanceof TranscribeError ? e.message : e);
      return fail(502, "Couldn't transcribe the voice note. Try again, or type your notes.", { retry: true });
    }
    await logUsage(me.profile.id, "transcribe_seconds", Math.round(input.audioSeconds ?? 0));
  }
  const source = [transcript, input.notes.trim()].filter(Boolean).join("\n\n");

  const { data: session, error: sessionError } = await supabase
    .from("tutor_sessions")
    .insert({
      tutor_id: me.profile.id,
      student_id: student.id,
      starts_at: zonedDateTimeToUtc(input.date, input.startTime).toISOString(),
      duration_min: input.durationMin,
      rate_cents: student.tutor_families.rate_cents_override ?? me.tutor.default_rate_cents,
      subjects: input.subjects,
    })
    .select("id")
    .single();
  if (sessionError) return fail(500, "Couldn't save the session.");
  const { data: report, error: reportError } = await supabase
    .from("tutor_reports")
    .insert({ tutor_id: me.profile.id, session_id: session.id, source: hasAudio ? "voice" : "typed", transcript: source.slice(0, 20000) })
    .select("id")
    .single();
  if (reportError) return fail(500, "Couldn't save the note.");

  // Logged from a scheduled lesson: mark the lesson done (it now points at this session).
  if (input.lessonId) {
    await supabase.from("tutor_lessons").update({ session_id: session.id }).eq("id", input.lessonId).is("session_id", null);
  }

  const drafted = await draftReport(supabase, me.profile.id, report.id);
  await track({
    name: drafted.ok ? "lesson_report_generated" : "lesson_report_failed",
    product: "tutors",
    role: "tutor",
    userId: me.profile.id,
    email: me.profile.email,
    objectType: "tutor_report",
    objectId: report.id,
    props: { kind: hasAudio ? "voice" : "typed" },
    dedupeKey: drafted.ok ? `report_generated:${report.id}` : undefined,
  });
  return Response.json({ reportId: report.id, draftError: drafted.ok ? null : drafted.error });
}
