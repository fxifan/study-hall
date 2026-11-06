import "server-only";
import { isReservedTestEmail } from "./email";
import { createAdminClient } from "./supabase/admin";

/**
 * Product events (coding action plan §2, §6; catalogue in docs/events.md). Call track() on the
 * server, after the action it describes has succeeded. Events carry ids, statuses and labels only:
 * never names, emails, notes, transcripts, report or invoice content (the property allow-list
 * below drops anything else). A dedupe key makes retries and refreshes count once. Tracking never
 * throws: a failed insert is logged and the user's action carries on.
 */
export const EVENTS = {
  // Shared
  user_signed_up: "A new parent or tutor account was created.",
  user_logged_in: "A user completed a login link.",
  login_link_sent: "Edumi emailed a personal login link through Resend (also the rate limit's counter).",
  onboarding_completed: "A parent finished sign-up details and consents and reached payment.",
  subscription_started: "A Stripe subscription became active (family plan or tutor Solo).",
  subscription_cancelled: "A Stripe subscription ended.",
  payment_failed: "A subscription went past due or unpaid.",
  // Study Hall
  student_goal_created: "A student added a task to their session plan.",
  study_session_attended: "A supervisor marked a student present.",
  study_session_missed: "A supervisor marked a student absent.",
  parent_report_approved: "A supervisor approved a session report for parents.",
  parent_report_delivered: "An admin marked a session report as sent to the parent.",
  // Tutors
  student_record_created: "A tutor added a student.",
  voice_note_uploaded: "A tutor's voice note reached the server.",
  transcription_completed: "A voice note was transcribed.",
  transcription_failed: "Transcribing a voice note failed.",
  lesson_report_generated: "An AI draft of a lesson report was produced.",
  lesson_report_failed: "Drafting a lesson report failed.",
  lesson_report_approved: "A tutor sent or shared a report (approval happens at send).",
  invoice_generated: "A tutor created an invoice.",
  invoice_sent: "A tutor sent or marked an invoice as sent.",
  resource_generated: "A tutor generated a practice set or writing tips.",
  // Edumi students (docs/student-social.md)
  study_group_created: "A student created a study group.",
  study_group_joined: "A student joined a study group with an invite code.",
  study_session_started: "A student started a verified study timer for a group.",
  study_session_stopped: "A student stopped a study timer (seconds credited).",
  help_requested: "A student called out for help in a group.",
  help_accepted: "A group member accepted a help request.",
  help_resolved: "A requester marked their help request sorted.",
  message_reported: "A student reported a group message.",
  student_resource_generated: "A student generated notes, flashcards or a quiz.",
  student_resource_completed: "A student marked notes or flashcards complete.",
  student_resource_flagged: "A student flagged generated content as incorrect.",
  quiz_submitted: "A student submitted a quiz for marking.",
} as const;
export type EventName = keyof typeof EVENTS;
export type Product = "study_hall" | "tutors" | "platform";
type Role = "parent" | "student" | "proctor" | "admin" | "tutor";

/** Only these property keys are stored; values must be short scalars. */
const ALLOWED_PROPS = new Set(["plan", "status", "lang", "langs", "source", "kind", "count", "reason", "via", "framework", "subject_area", "seconds", "error"]);

export function cleanProps(props: Record<string, unknown> = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_PROPS.has(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 60);
    else if (Array.isArray(v)) out[k] = v.map(String).join(",").slice(0, 60);
  }
  return out;
}

export async function track(event: {
  name: EventName;
  product: Product;
  role?: Role | null;
  userId?: string | null;
  /** The user's email, only to flag test accounts (*.test, example.com); never stored. */
  email?: string | null;
  objectType?: string;
  objectId?: string | null;
  props?: Record<string, unknown>;
  dedupeKey?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    let isTest = event.email ? isReservedTestEmail(event.email) : false;
    if (!event.email && event.userId) {
      const { data } = await admin.from("profiles").select("email").eq("id", event.userId).maybeSingle();
      isTest = isReservedTestEmail((data?.email as string | undefined) ?? "");
    }
    // Study Hall events about a student: a test student (seeded, *.test) is test data too.
    if (!isTest && event.objectType === "student" && event.objectId) {
      const { data } = await admin
        .from("students")
        .select("profiles!students_profile_id_fkey(email), parent_students(profiles(email))")
        .eq("id", event.objectId)
        .maybeSingle();
      const own = (data?.profiles as unknown as { email: string } | null)?.email ?? "";
      const parents = ((data?.parent_students as unknown as { profiles: { email: string } | null }[]) ?? []).map((p) => p.profiles?.email ?? "");
      // A student with no login of their own is judged by their parents' accounts.
      isTest = [own, ...parents].some((e) => e && isReservedTestEmail(e));
    }
    const { error } = await admin.from("product_events").insert({
      name: event.name,
      product: event.product,
      role: event.role ?? null,
      user_id: event.userId ?? null,
      object_type: event.objectType ?? null,
      object_id: event.objectId ?? null,
      properties: cleanProps(event.props),
      dedupe_key: event.dedupeKey ?? null,
      is_test: isTest,
    });
    // 23505: the dedupe key already exists, so this event was already counted.
    if (error && error.code !== "23505") console.error("Event not recorded", event.name, error.code);
  } catch (e) {
    console.error("Event not recorded", event.name, e instanceof Error ? e.message : e);
  }
}
