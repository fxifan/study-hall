/**
 * Tutoring plan and study profiles against the real Supabase project: who can read and write a
 * child's subjects, what a session's tutor sees, help-request priority, and the tutor WWCC gate.
 * Family A is on the tutoring plan and family B on supervision (scripts/seed.ts). Uses its own room.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "../../scripts/lib/env";
import { SEED_IDS } from "../../scripts/seed-data";
import { signInAs, userIdOf } from "../helpers";

const service = createAdminClient();
let parentA: SupabaseClient;
let parentB: SupabaseClient;
let studentA: SupabaseClient;
let studentB: SupabaseClient;
let tutor: SupabaseClient;
let roomId: string;
let sessionId: string;
let juniorEnglish: string;

beforeAll(async () => {
  [parentA, parentB, studentA, studentB, tutor] = await Promise.all([
    signInAs("parentA"),
    signInAs("parentB"),
    signInAs("studentA"),
    signInAs("studentB"),
    signInAs("tutor"),
  ]);
  const room = await service
    .from("rooms")
    .insert({ org_id: SEED_IDS.org, name: "RLS tutoring room", video_url: "https://example.com/tutoring-room", capacity: 5 })
    .select("id")
    .single();
  if (room.error) throw room.error;
  roomId = room.data.id;

  const startsAt = new Date(Date.now() + 2 * 86_400_000);
  startsAt.setUTCMinutes(0, 0, 0);
  const session = await service
    .from("sessions")
    .insert({
      room_id: roomId,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 4 * 3_600_000).toISOString(),
      tutor_id: await userIdOf("tutor"),
    })
    .select("id")
    .single();
  if (session.error) throw session.error;
  sessionId = session.data.id;
  const enrol = await service.from("enrolments").insert([
    { session_id: sessionId, student_id: SEED_IDS.studentA },
    { session_id: sessionId, student_id: SEED_IDS.studentB },
  ]);
  if (enrol.error) throw enrol.error;

  juniorEnglish = (await service.from("subjects").select("id").eq("code", "jr-english").single()).data!.id;
});

afterAll(async () => {
  await service.from("student_subjects").delete().eq("student_id", SEED_IDS.studentA2);
  if (!roomId) return;
  await service.from("help_requests").delete().eq("session_id", sessionId);
  await service.from("sessions").delete().eq("room_id", roomId);
  await service.from("rooms").delete().eq("id", roomId);
});

describe("study profiles", () => {
  it("lets a parent record their own child's subjects", async () => {
    const insert = await parentA
      .from("student_subjects")
      .insert({ student_id: SEED_IDS.studentA2, subject_id: juniorEnglish, wants_help: true });
    expect(insert.error).toBeNull();
    const { data } = await parentA.from("student_subjects").select("wants_help").eq("student_id", SEED_IDS.studentA2);
    expect(data).toEqual([{ wants_help: true }]);
  });

  it("hides another family's subjects and refuses writes to them", async () => {
    const read = await parentB.from("student_subjects").select("subject_id").eq("student_id", SEED_IDS.studentA);
    expect(read.data).toEqual([]);
    const write = await parentB
      .from("student_subjects")
      .insert({ student_id: SEED_IDS.studentA2, subject_id: juniorEnglish, wants_help: false });
    expect(write.error?.code).toBe("42501");
  });

  it("lets a student read only their own subjects, without editing them", async () => {
    const own = await studentA.from("student_subjects").select("student_id");
    expect(own.data?.length).toBeGreaterThan(0);
    expect(new Set(own.data!.map((r) => r.student_id))).toEqual(new Set([SEED_IDS.studentA]));
    const write = await studentA
      .from("student_subjects")
      .insert({ student_id: SEED_IDS.studentA, subject_id: juniorEnglish, wants_help: false });
    expect(write.error?.code).toBe("42501");
  });
});

describe("the session's tutor", () => {
  it("sees the session and its roster, tutoring students first", async () => {
    const session = await tutor.from("sessions").select("id").eq("id", sessionId);
    expect(session.data).toEqual([{ id: sessionId }]);

    const { data: roster, error } = await tutor.rpc("session_roster", { p_session: sessionId });
    expect(error).toBeNull();
    expect(roster.map((r: { student_id: string }) => r.student_id)).toEqual([SEED_IDS.studentA, SEED_IDS.studentB]);
    expect(roster[0]).toMatchObject({ tutoring: true, first_name: "Ava" });
    expect(roster[0].subjects.length).toBeGreaterThan(0);
    expect(roster[1].tutoring).toBe(false);
  });

  it("gives a parent no roster", async () => {
    const { data } = await parentB.rpc("session_roster", { p_session: sessionId });
    expect(data).toEqual([]);
  });

  it("must have a verified WWCC, like a supervisor", async () => {
    const { error } = await service.from("sessions").update({ tutor_id: await userIdOf("admin") }).eq("id", sessionId);
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/Working with Children Check/);
  });
});

describe("help priority", () => {
  it("knows which students are on the tutoring plan", async () => {
    expect((await studentA.rpc("my_tutoring_plan")).data).toBe(true);
    expect((await studentB.rpc("my_tutoring_plan")).data).toBe(false);
  });

  it("puts tutoring students' help requests first", async () => {
    const a = await studentA
      .from("help_requests")
      .insert({ session_id: sessionId, student_id: SEED_IDS.studentA, subject: "Methods", description: "Chain rule", priority: false })
      .select("priority")
      .single();
    const b = await studentB
      .from("help_requests")
      .insert({ session_id: sessionId, student_id: SEED_IDS.studentB, subject: "Physics", description: "Forces", priority: true })
      .select("priority")
      .single();
    // The database sets priority from the plan, whatever the client sends.
    expect(a.data).toEqual({ priority: true });
    expect(b.data).toEqual({ priority: false });

    const queue = await tutor
      .from("help_requests")
      .select("subject")
      .eq("session_id", sessionId)
      .order("priority", { ascending: false })
      .order("created_at");
    expect(queue.data?.map((r) => r.subject)).toEqual(["Methods", "Physics"]);
  });
});
