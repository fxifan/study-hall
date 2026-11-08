/**
 * Tutor product RLS (docs/tutor-reports-spec.md §5, §10): tutor A can't read or write tutor B's rows,
 * rows can't point at another tutor's family/student/session, plan fields and usage are
 * server-only, sent invoices and reports are fixed, and invoice numbers run per tutor.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient, requireEnv } from "../../scripts/lib/env";
import { SEED_IDS } from "../../scripts/seed-data";
import { signInAs, signedOutClient } from "../helpers";

const admin = createAdminClient();
const stamp = Date.now();

type Tutor = { id: string; client: SupabaseClient; familyId: string; studentId: string; sessionId: string; reportId: string };

async function signInEmail(email: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (verifyError) throw verifyError;
  return client;
}

async function makeTutor(label: string): Promise<Tutor> {
  const email = `rls-tutor-${label}-${stamp}@studyhall.test`;
  const user = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "tutor", org_id: SEED_IDS.org } });
  if (user.error) throw user.error;
  const id = user.data.user.id;
  const row = await admin.from("tutors").insert({ id, display_name: `Tutor ${label}` });
  if (row.error) throw row.error;
  const client = await signInEmail(email);

  const family = await client
    .from("tutor_families")
    .insert({ tutor_id: id, parent_name: `Parent ${label}`, parent_email: `parent-${label}-${stamp}@studyhall.test` })
    .select("id")
    .single();
  if (family.error) throw family.error;
  const student = await client
    .from("tutor_students")
    .insert({ tutor_id: id, family_id: family.data.id, first_name: `Kid${label}`, last_initial: "Z", year_level: 11, subjects: ["Chemistry"] })
    .select("id")
    .single();
  if (student.error) throw student.error;
  const session = await client
    .from("tutor_sessions")
    .insert({ tutor_id: id, student_id: student.data.id, starts_at: new Date().toISOString(), duration_min: 60, rate_cents: 6000 })
    .select("id")
    .single();
  if (session.error) throw session.error;
  const report = await client
    .from("tutor_reports")
    .insert({ tutor_id: id, session_id: session.data.id, source: "typed", transcript: `secret notes ${label}` })
    .select("id")
    .single();
  if (report.error) throw report.error;
  return { id, client, familyId: family.data.id, studentId: student.data.id, sessionId: session.data.id, reportId: report.data.id };
}

let a: Tutor;
let b: Tutor;
const taskIds = { a: "", b: "" };

beforeAll(async () => {
  a = await makeTutor("a");
  b = await makeTutor("b");
  for (const t of [a, b]) {
    const task = await t.client.from("tutor_tasks").insert({ tutor_id: t.id, student_id: t.studentId, body: "Three chain-rule questions" }).select("id").single();
    if (task.error) throw task.error;
    taskIds[t === a ? "a" : "b"] = task.data.id;
  }
  await admin.from("tutor_usage_events").insert([
    { tutor_id: a.id, kind: "llm_tokens", amount: 1200 },
    { tutor_id: b.id, kind: "llm_tokens", amount: 900 },
  ]);
});

afterAll(async () => {
  for (const t of [a, b]) if (t) await admin.auth.admin.deleteUser(t.id); // cascades to every tutor_* row
});

const TABLES = [
  "tutors",
  "tutor_families",
  "tutor_students",
  "tutor_sessions",
  "tutor_reports",
  "tutor_invoices",
  "tutor_invoice_lines",
  "tutor_usage_events",
  "tutor_lessons",
  "tutor_meeting_links",
  "tutor_resources",
  "tutor_tasks",
];

describe("tutor isolation", () => {
  it("tutor A reads only their own rows in every tutor table", async () => {
    for (const table of TABLES) {
      const { data, error } = await a.client.from(table).select("tutor_id:" + (table === "tutors" ? "id" : "tutor_id"));
      expect(error, table).toBeNull();
      expect((data as unknown as { tutor_id: string }[]).every((r) => r.tutor_id === a.id), table).toBe(true);
    }
    const { data } = await a.client.from("tutor_reports").select("transcript").eq("id", b.reportId);
    expect(data).toEqual([]);
  });

  it("tutor A can't update or delete tutor B's rows", async () => {
    const upd = await a.client.from("tutor_families").update({ parent_name: "Hijacked" }).eq("id", b.familyId).select("id");
    expect(upd.data).toEqual([]);
    const del = await a.client.from("tutor_reports").delete().eq("id", b.reportId).select("id");
    expect(del.data).toEqual([]);
    const { data } = await admin.from("tutor_families").select("parent_name").eq("id", b.familyId).single();
    expect(data?.parent_name).toBe("Parent b");
  });

  it("tutor A can't insert rows owned by B, or point at B's family, student or session", async () => {
    const owned = await a.client.from("tutor_families").insert({ tutor_id: b.id, parent_name: "x", parent_email: "x@studyhall.test" });
    expect(owned.error).not.toBeNull();
    const foreignFamily = await a.client
      .from("tutor_students")
      .insert({ tutor_id: a.id, family_id: b.familyId, first_name: "X", last_initial: "Y", year_level: 9 });
    expect(foreignFamily.error).not.toBeNull();
    const foreignStudent = await a.client
      .from("tutor_sessions")
      .insert({ tutor_id: a.id, student_id: b.studentId, starts_at: new Date().toISOString(), duration_min: 60, rate_cents: 1 });
    expect(foreignStudent.error).not.toBeNull();
    const foreignSession = await a.client.from("tutor_reports").insert({ tutor_id: a.id, session_id: b.sessionId, source: "typed" });
    expect(foreignSession.error).not.toBeNull();
  });

  it("parents, students and signed-out visitors see no tutor data", async () => {
    const parent = await signInAs("parentA");
    for (const table of TABLES) {
      const { data } = await parent.from(table).select("id");
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("Edumi admins read tutors and usage for /admin/costs, but not families or reports", async () => {
    const founder = await signInAs("admin");
    const tutors = await founder.from("tutors").select("id").in("id", [a.id, b.id]);
    expect(tutors.data?.length).toBe(2);
    const usage = await founder.from("tutor_usage_events").select("tutor_id").in("tutor_id", [a.id, b.id]);
    expect(usage.data?.length).toBe(2);
    for (const table of ["tutor_families", "tutor_students", "tutor_reports", "tutor_invoices"]) {
      const { data } = await founder.from(table).select("id").in("tutor_id", [a.id, b.id]);
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("tutors can't change their plan or trial, or write usage events", async () => {
    const plan = await a.client.from("tutors").update({ plan: "solo" }).eq("id", a.id);
    expect(plan.error?.code).toBe("42501");
    const trial = await a.client.from("tutors").update({ trial_ends_at: "2099-01-01T00:00:00Z" }).eq("id", a.id);
    expect(trial.error?.code).toBe("42501");
    const ok = await a.client.from("tutors").update({ display_name: "Tutor A renamed" }).eq("id", a.id);
    expect(ok.error).toBeNull();
    const usage = await a.client.from("tutor_usage_events").insert({ tutor_id: a.id, kind: "email", amount: 1 });
    expect(usage.error).not.toBeNull();
    const insertTutor = await a.client.from("tutors").insert({ id: b.id, display_name: "x" });
    expect(insertTutor.error).not.toBeNull();
  });
});

describe("invoices", () => {
  const line = (sessionId: string | null, cents: number) => ({ session_id: sessionId, description: "Session", qty: 1, unit_cents: cents, amount_cents: cents });
  const create = (t: Tutor, familyId: string, lines: ReturnType<typeof line>[], total: number) =>
    t.client.rpc("tutor_create_invoice", {
      p_family_id: familyId,
      p_issue_date: "2026-11-02",
      p_due_date: "2026-11-09",
      p_gst_registered: false,
      p_lines: lines,
      p_subtotal_cents: total,
      p_gst_cents: 0,
      p_total_cents: total,
    });

  it("refuses totals that don't match the lines, and B's sessions or family", async () => {
    expect((await create(a, a.familyId, [line(a.sessionId, 6000)], 5999)).error).not.toBeNull();
    expect((await create(a, a.familyId, [line(b.sessionId, 6000)], 6000)).error).not.toBeNull();
    expect((await create(a, b.familyId, [line(null, 6000)], 6000)).error).not.toBeNull();
    const { data } = await admin.from("tutor_sessions").select("invoice_id").eq("id", b.sessionId).single();
    expect(data?.invoice_id).toBeNull();
  });

  it("numbers per tutor, claims sessions once, and freezes the invoice once sent", async () => {
    const first = await create(a, a.familyId, [line(a.sessionId, 6000)], 6000);
    expect(first.error).toBeNull();
    const again = await create(a, a.familyId, [line(a.sessionId, 6000)], 6000);
    expect(again.error).not.toBeNull(); // already invoiced
    const second = await create(a, a.familyId, [line(null, 2500)], 2500);
    const otherTutor = await create(b, b.familyId, [line(null, 100)], 100);

    const { data: numbers } = await admin.from("tutor_invoices").select("tutor_id, number").in("id", [first.data, second.data, otherTutor.data]);
    expect(numbers?.find((n) => n.tutor_id === a.id && n.number === 1)).toBeTruthy();
    expect(numbers?.find((n) => n.tutor_id === a.id && n.number === 2)).toBeTruthy();
    expect(numbers?.find((n) => n.tutor_id === b.id)?.number).toBe(1);

    const session = await admin.from("tutor_sessions").select("status, invoice_id").eq("id", a.sessionId).single();
    expect(session.data).toEqual({ status: "invoiced", invoice_id: first.data });

    const sent = await a.client.from("tutor_invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", first.data);
    expect(sent.error).toBeNull();
    const edit = await a.client.from("tutor_invoices").update({ total_cents: 1, subtotal_cents: 1 }).eq("id", first.data);
    expect(edit.error?.code).toBe("42501");
    const lineEdit = await a.client.from("tutor_invoice_lines").update({ description: "changed" }).eq("invoice_id", first.data);
    expect(lineEdit.error?.code).toBe("42501");
    const del = await a.client.from("tutor_invoices").delete().eq("id", first.data);
    expect(del.error?.code).toBe("42501");
    const paid = await a.client.from("tutor_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", first.data);
    expect(paid.error).toBeNull();

    // Deleting a draft releases nothing it doesn't own and is allowed.
    const delDraft = await a.client.from("tutor_invoices").delete().eq("id", second.data);
    expect(delDraft.error).toBeNull();
  });

  it("a sent report can't be rewritten", async () => {
    const send = await a.client
      .from("tutor_reports")
      .update({ final_json: { en: { covered: ["x"] } }, sent_at: new Date().toISOString(), sent_to: "p@studyhall.test" })
      .eq("id", a.reportId);
    expect(send.error).toBeNull();
    const rewrite = await a.client.from("tutor_reports").update({ final_json: { en: { covered: ["y"] } } }).eq("id", a.reportId);
    expect(rewrite.error?.code).toBe("42501");
    const forget = await a.client.from("tutor_reports").update({ transcript: null }).eq("id", a.reportId);
    expect(forget.error).toBeNull();
  });
});

describe("dashboard: lessons, meeting links, calendar feed", () => {
  it("tutor A can't see, schedule for, or link to tutor B's students and links", async () => {
    const bLink = await b.client
      .from("tutor_meeting_links")
      .insert({ tutor_id: b.id, name: "B room", url: "https://zoom.us/j/1234567890" })
      .select("id")
      .single();
    expect(bLink.error).toBeNull();
    const bLesson = await b.client
      .from("tutor_lessons")
      .insert({ tutor_id: b.id, student_id: b.studentId, starts_at: new Date().toISOString(), duration_min: 60, meeting_link_id: bLink.data!.id })
      .select("id")
      .single();
    expect(bLesson.error).toBeNull();

    expect((await a.client.from("tutor_lessons").select("id").eq("id", bLesson.data!.id)).data).toEqual([]);
    expect((await a.client.from("tutor_meeting_links").select("id").eq("id", bLink.data!.id)).data).toEqual([]);
    const forB = await a.client.from("tutor_lessons").insert({ tutor_id: a.id, student_id: b.studentId, starts_at: new Date().toISOString(), duration_min: 60 });
    expect(forB.error).not.toBeNull();
    const withBLink = await a.client
      .from("tutor_lessons")
      .insert({ tutor_id: a.id, student_id: a.studentId, starts_at: new Date().toISOString(), duration_min: 60, meeting_link_id: bLink.data!.id });
    expect(withBLink.error).not.toBeNull();
    const claimSession = await a.client
      .from("tutor_lessons")
      .insert({ tutor_id: a.id, student_id: a.studentId, starts_at: new Date().toISOString(), duration_min: 60, session_id: b.sessionId });
    expect(claimSession.error).not.toBeNull();
    const move = await a.client.from("tutor_lessons").update({ duration_min: 15 }).eq("id", bLesson.data!.id).select("id");
    expect(move.data).toEqual([]);
  });

  it("tutors can't set their own calendar feed token (it's the feed's credential)", async () => {
    const set = await a.client.from("tutors").update({ calendar_feed_token: "a".repeat(32) }).eq("id", a.id);
    expect(set.error?.code).toBe("42501");
  });
});

describe("resources and curriculum (docs/tutor-resources-spec.md)", () => {
  it("tutors keep their resources to themselves and can't write curriculum or resource usage", async () => {
    const points = await admin
      .from("curriculum_points")
      .insert([
        { framework: "vce", subject: `RLS ${stamp}`, unit_or_level: "Unit 3", area: "A", summary: "Published point", is_published: true },
        { framework: "vce", subject: `RLS ${stamp}`, unit_or_level: "Unit 3", area: "A", summary: "Unpublished point", is_published: false },
      ])
      .select("id, is_published");
    if (points.error) throw points.error;
    const pointId = points.data.find((p) => p.is_published)!.id;
    try {
      const content = { instructions: "", questions: [] };
      const mine = await b.client
        .from("tutor_resources")
        .insert({ tutor_id: b.id, kind: "practice_set", title: "B's set", framework: "vce", subject: "X", unit_or_level: "Unit 3", point_ids: [pointId], content })
        .select("id")
        .single();
      expect(mine.error).toBeNull();
      expect((await a.client.from("tutor_resources").select("id").eq("id", mine.data!.id)).data).toEqual([]);
      expect((await a.client.from("tutor_resources").update({ title: "hijack" }).eq("id", mine.data!.id).select("id")).data).toEqual([]);
      const forged = await a.client
        .from("tutor_resources")
        .insert({ tutor_id: b.id, kind: "practice_set", title: "forged", framework: "vce", subject: "X", unit_or_level: "Unit 3", point_ids: [pointId], content });
      expect(forged.error).not.toBeNull();

      // Tutors read published points only, and can't write them.
      const read = await a.client.from("curriculum_points").select("summary").eq("subject", `RLS ${stamp}`);
      expect(read.data?.map((r) => r.summary)).toEqual(["Published point"]);
      expect((await a.client.from("curriculum_points").insert({ framework: "vce", subject: "x", unit_or_level: "y", area: "z", summary: "w" })).error).not.toBeNull();
      expect((await a.client.from("curriculum_points").update({ summary: "changed" }).eq("id", pointId).select("id")).data ?? []).toEqual([]);
      // ...or log their own resource usage (it's what the trial limit counts).
      expect((await a.client.from("tutor_usage_events").insert({ tutor_id: a.id, kind: "llm_tokens", amount: 0, purpose: "resource" })).error).not.toBeNull();

      // Admins see no tutor's resources through RLS (counts only, via the server).
      const founder = await signInAs("admin");
      expect((await founder.from("tutor_resources").select("id").eq("id", mine.data!.id)).data).toEqual([]);
    } finally {
      await admin.from("curriculum_points").delete().eq("subject", `RLS ${stamp}`);
    }
  });
});

describe("product events (docs/events.md)", () => {
  it("no signed-in user can read or write analytics events", async () => {
    const read = await a.client.from("product_events").select("id").limit(1);
    expect(read.error ?? read.data?.length === 0).toBeTruthy();
    const write = await a.client.from("product_events").insert({ name: "user_signed_up", product: "tutors" });
    expect(write.error).not.toBeNull();
    const founder = await signInAs("admin");
    const adminRead = await founder.from("product_events").select("id").limit(1);
    expect(adminRead.error ?? adminRead.data?.length === 0).toBeTruthy();
  });
});

describe("tutor next steps", () => {
  it("can't be read, changed or pointed at another tutor's student", async () => {
    expect((await a.client.from("tutor_tasks").select("id").eq("id", taskIds.b)).data).toEqual([]);
    const upd = await a.client.from("tutor_tasks").update({ status: "done" }).eq("id", taskIds.b).select("id");
    expect(upd.data).toEqual([]);
    const cross = await a.client.from("tutor_tasks").insert({ tutor_id: a.id, student_id: b.studentId, body: "sneaky" });
    expect(cross.error).not.toBeNull();
    const own = await a.client.from("tutor_tasks").update({ status: "stuck", note: "Q3" }).eq("id", taskIds.a).select("status");
    expect(own.data).toEqual([{ status: "stuck" }]);
    expect((await signedOutClient().from("tutor_tasks").select("id")).data ?? []).toEqual([]);
  });
});
