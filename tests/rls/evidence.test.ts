/**
 * Session checklist evidence and supervisor check-ins (owner brief, 30 Oct 2026): uploaded work is
 * private to the student, their parents, the session's staff and admins; storage can't be read
 * directly; check-ins are the session staff's, append-only, and only reach the right family.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "../../scripts/lib/env";
import { SEED_IDS } from "../../scripts/seed-data";
import { signInAs, userIdOf } from "../helpers";

const service = createAdminClient();
const BUCKET = "work-evidence";
let studentA: SupabaseClient;
let studentB: SupabaseClient;
let parentA: SupabaseClient;
let parentB: SupabaseClient;
let tutor: SupabaseClient;
let proctor: SupabaseClient;
let roomId: string;
let sessionId: string;
let goalA: string;
let goalB: string;
const pathA = `${SEED_IDS.studentA}/rls-test/${crypto.randomUUID()}.png`;
const evidence: string[] = [];

beforeAll(async () => {
  [studentA, studentB, parentA, parentB, tutor, proctor] = await Promise.all([
    signInAs("studentA"),
    signInAs("studentB"),
    signInAs("parentA"),
    signInAs("parentB"),
    signInAs("tutor"),
    signInAs("proctor"),
  ]);
  const room = await service
    .from("rooms")
    .insert({ org_id: SEED_IDS.org, name: "RLS evidence room", video_url: "https://example.com/evidence-room", capacity: 5 })
    .select("id")
    .single();
  if (room.error) throw room.error;
  roomId = room.data.id;
  // Staffed by the tutor only, so the seeded proctor isn't this session's staff.
  const start = new Date(Date.now() + 3 * 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  const session = await service
    .from("sessions")
    .insert({ room_id: roomId, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 2 * 3_600_000).toISOString(), tutor_id: await userIdOf("tutor") })
    .select("id")
    .single();
  if (session.error) throw session.error;
  sessionId = session.data.id;
  await service.from("enrolments").insert([
    { session_id: sessionId, student_id: SEED_IDS.studentA },
    { session_id: sessionId, student_id: SEED_IDS.studentB },
  ]);
  const goals = await service
    .from("goals")
    .insert([
      { session_id: sessionId, student_id: SEED_IDS.studentA, position: 1, text: "Methods: questions 1–15", subject: "Methods", expected_output: "Worked answers" },
      { session_id: sessionId, student_id: SEED_IDS.studentB, position: 1, text: "Physics: forces worksheet" },
    ])
    .select("id, student_id");
  if (goals.error) throw goals.error;
  goalA = goals.data.find((g) => g.student_id === SEED_IDS.studentA)!.id;
  goalB = goals.data.find((g) => g.student_id === SEED_IDS.studentB)!.id;
  const upload = await service.storage.from(BUCKET).upload(pathA, new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), { contentType: "image/png" });
  if (upload.error) throw upload.error;
});

afterAll(async () => {
  await service.storage.from(BUCKET).remove([pathA]);
  if (roomId) {
    await service.from("sessions").delete().eq("room_id", roomId);
    await service.from("rooms").delete().eq("id", roomId);
  }
});

describe("work evidence", () => {
  it("lets a student attach evidence to their own task", async () => {
    const { data, error } = await studentA
      .from("goal_evidence")
      .insert({ goal_id: goalA, student_id: SEED_IDS.studentA, storage_path: pathA, file_name: "worksheet.png", content_type: "image/png", size_bytes: 4 })
      .select("id")
      .single();
    expect(error).toBeNull();
    evidence.push(data!.id);
  });

  it("refuses evidence on someone else's task, or files that aren't photos or PDFs", async () => {
    const other = await studentA
      .from("goal_evidence")
      .insert({ goal_id: goalB, student_id: SEED_IDS.studentB, storage_path: `${SEED_IDS.studentB}/x/y.png`, file_name: "y.png", content_type: "image/png", size_bytes: 4 });
    expect(other.error?.code).toBe("42501");
    const html = await service
      .from("goal_evidence")
      .insert({ goal_id: goalA, student_id: SEED_IDS.studentA, storage_path: `${SEED_IDS.studentA}/x/z.html`, file_name: "z.html", content_type: "text/html", size_bytes: 4 });
    expect(html.error?.code).toBe("23514");
  });

  it("shows evidence to the student, their parent and the session's staff only", async () => {
    for (const [client, visible] of [
      [studentA, 1],
      [parentA, 1],
      [tutor, 1],
      [studentB, 0],
      [parentB, 0],
      [proctor, 0],
    ] as const) {
      const { data } = await client.from("goal_evidence").select("id").eq("goal_id", goalA);
      expect(data).toHaveLength(visible);
    }
  });

  it("keeps the files private: nobody signed in can read the bucket directly", async () => {
    for (const client of [studentA, parentA, tutor]) {
      const { data } = await client.storage.from(BUCKET).download(pathA);
      expect(data).toBeNull();
    }
  });

  it("allows at most three files per task", async () => {
    for (let i = 0; i < 2; i++) {
      const { data, error } = await service
        .from("goal_evidence")
        .insert({ goal_id: goalA, student_id: SEED_IDS.studentA, storage_path: `${pathA}.${i}`, file_name: `f${i}.png`, content_type: "image/png", size_bytes: 4 })
        .select("id")
        .single();
      expect(error).toBeNull();
      evidence.push(data!.id);
    }
    const fourth = await service
      .from("goal_evidence")
      .insert({ goal_id: goalA, student_id: SEED_IDS.studentA, storage_path: `${pathA}.3`, file_name: "f3.png", content_type: "image/png", size_bytes: 4 });
    expect(fourth.error?.code).toBe("23514");
  });
});

describe("supervisor check-ins", () => {
  it("lets the session's staff add one, as themselves", async () => {
    const tutorId = await userIdOf("tutor");
    const ok = await tutor
      .from("session_checkins")
      .insert({ session_id: sessionId, student_id: SEED_IDS.studentA, template_en: "Phone visible once during the session.", template_zh: "本次学习期间，学生曾有一次手机出现在视线范围内。", created_by: tutorId });
    expect(ok.error).toBeNull();
    const spoofed = await tutor
      .from("session_checkins")
      .insert({ session_id: sessionId, student_id: SEED_IDS.studentA, note: "x", created_by: await userIdOf("admin") });
    expect(spoofed.error?.code).toBe("42501");
  });

  it("refuses staff who aren't on the session, and families", async () => {
    for (const client of [proctor, parentA, studentA]) {
      const { error } = await client.from("session_checkins").insert({ session_id: sessionId, student_id: SEED_IDS.studentA, note: "x" });
      expect(error?.code).toBe("42501");
    }
  });

  it("shows check-ins and flags to that student's parent only once the report is released", async () => {
    await service.from("focus_flags").insert({ session_id: sessionId, student_id: SEED_IDS.studentA, type: "phone_visible" });
    expect((await parentA.from("session_checkins").select("id").eq("session_id", sessionId)).data).toHaveLength(0);
    expect((await parentA.from("focus_flags").select("id").eq("session_id", sessionId)).data).toHaveLength(0);
    await service.from("reports").insert({ session_id: sessionId, student_id: SEED_IDS.studentA, body_text: "(test)", status: "approved" });
    expect((await parentA.from("focus_flags").select("id").eq("session_id", sessionId)).data).toHaveLength(1);
    expect((await parentA.from("session_checkins").select("id").eq("session_id", sessionId)).data).toHaveLength(1);
    expect((await parentB.from("session_checkins").select("id").eq("session_id", sessionId)).data).toHaveLength(0);
    const { data: edited } = await tutor.from("session_checkins").update({ note: "changed" }).eq("session_id", sessionId).select("id");
    expect(edited ?? []).toHaveLength(0);
  });
});
