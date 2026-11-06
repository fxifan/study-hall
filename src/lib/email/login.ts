import "server-only";
import { createClient } from "@supabase/supabase-js";
import { emailLimitKind, isReservedTestEmail } from "@/lib/email";
import { formatMinutes } from "@/lib/social/credit";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import { loginEmail } from "./login-template";
import { sendEmail } from "./send";

/**
 * Personal login emails (owner, 6 Nov 2026). Edumi makes the one-time link itself
 * (auth.admin.generateLink) and sends it through Resend, so the email can greet the person by name
 * and say what's waiting for them: a student's group goal, a parent's children, a tutor's workspace.
 * The link is the same token_hash link /auth/confirm already accepts, so it works on any device.
 *
 * Without RESEND_API_KEY it falls back to Supabase's own mailer (the generic template), so nothing
 * breaks before Resend is set up. Rate limits mirror Supabase's: one email a minute and five an hour
 * per account, counted from login_link_sent events.
 */
export type LoginLinkResult = { ok: true } | { ok: false; reason: "cooldown" | "quota" | "failed" };

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

type Person = { id: string; role: string; email: string; fullName: string | null };

async function personFor(email: string): Promise<Person | null> {
  const { data } = await createAdminClient().from("profiles").select("id, role, email, full_name").eq("email", email).maybeSingle();
  return data ? { id: data.id as string, role: data.role as string, email: data.email as string, fullName: (data.full_name as string | null) ?? null } : null;
}

async function recentSends(userId: string): Promise<{ minute: number; hour: number }> {
  const admin = createAdminClient();
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const count = async (ms: number) =>
    (await admin.from("product_events").select("id", { count: "exact", head: true }).eq("name", "login_link_sent").eq("user_id", userId).gt("created_at", since(ms))).count ?? 0;
  const [minute, hour] = await Promise.all([count(60_000), count(3_600_000)]);
  return { minute, hour };
}

/** What the email says is waiting for this person. Facts only, from their own account. */
async function personalLines(p: Person): Promise<{ first: string; lines: string[] }> {
  const admin = createAdminClient();
  let first = p.fullName?.trim().split(/\s+/)[0] ?? "";
  const lines: string[] = [];
  if (p.role === "student") {
    const { data: s } = await admin.from("students").select("first_name").eq("profile_id", p.id).maybeSingle();
    first = (s?.first_name as string) ?? first;
    const { data: rows } = await admin
      .from("study_group_members")
      .select("study_groups!inner(id, name, timezone, daily_target_minutes, next_target_minutes, archived_at)")
      .eq("profile_id", p.id)
      .is("study_groups.archived_at", null)
      .limit(1);
    const group = (rows?.[0] as unknown as { study_groups: { id: string; name: string; timezone: string; daily_target_minutes: number; next_target_minutes: number | null } } | undefined)
      ?.study_groups;
    if (group) {
      const { todayProgress } = await import("@/lib/social/server");
      const p2 = await todayProgress(group);
      lines.push(
        p2.reached
          ? `${group.name} already hit today's goal. Think you can top the board anyway?`
          : `${group.name} has ${formatMinutes(p2.remainingMinutes)} to go on today's goal. Every minute you put in counts.`,
      );
    } else {
      lines.push("Start a group, share the invite code, and see who can outstudy who.");
    }
  } else if (p.role === "parent") {
    const { data: kids } = await admin.from("parent_students").select("students(first_name)").eq("parent_id", p.id);
    const names = (kids ?? []).flatMap((k) => {
      const s = k.students as unknown as { first_name: string } | null;
      return s ? [s.first_name] : [];
    });
    if (names.length) lines.push(`${names.join(" and ")}'s sessions, goals and reports are on your parent page.`);
  } else if (p.role === "tutor") {
    lines.push("Your dashboard, students, reports and invoices are ready.");
  } else if (p.role === "proctor") {
    lines.push("Your sessions and rosters are ready.");
  }
  return { first, lines };
}

async function supabaseFallback(email: string, origin: string): Promise<LoginLinkResult> {
  const auth = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }).auth;
  const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` } });
  if (!error || error.code === "otp_disabled" || error.code === "user_not_found") return { ok: true };
  const limit = emailLimitKind(error);
  if (limit) return { ok: false, reason: limit };
  console.error("Login email failed", error.code);
  return { ok: false, reason: "failed" };
}

/**
 * Email an existing account a personal login link. Unknown addresses get { ok: true } without an
 * email, so callers never reveal who has an account. Test domains are never emailed.
 */
export async function sendLoginLink(rawEmail: string, options: { origin: string; welcome?: boolean }): Promise<LoginLinkResult> {
  const email = rawEmail.trim().toLowerCase();
  if (isReservedTestEmail(email)) return { ok: true };
  if (!resendConfigured()) return supabaseFallback(email, options.origin);
  const person = await personFor(email);
  if (!person) return { ok: true };

  const sent = await recentSends(person.id);
  if (sent.minute >= 1) return { ok: false, reason: "cooldown" };
  if (sent.hour >= 5) return { ok: false, reason: "quota" };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    console.error("Login link not generated", error?.code ?? "no token");
    return { ok: false, reason: "failed" };
  }
  // /auth/confirm sends people on in the language they last chose (locale cookie).
  const url = `${options.origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`;
  try {
    const { first, lines } = await personalLines(person);
    await sendEmail({ to: email, email: loginEmail({ first, lines, url, welcome: Boolean(options.welcome) }) });
  } catch (e) {
    console.error("Login email not sent", e instanceof Error ? e.message : e);
    return { ok: false, reason: "failed" };
  }
  const { track } = await import("@/lib/events");
  await track({ name: "login_link_sent", product: "platform", role: person.role as "parent" | "student" | "proctor" | "admin" | "tutor", userId: person.id, props: { via: options.welcome ? "welcome" : "login" } });
  return { ok: true };
}
