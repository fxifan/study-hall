/**
 * Breakout log against the real Supabase project: the two-students-or-two-adults rule, the WWCC
 * check on every adult, the session window, and who can read or write the log. Uses its own room and
 * a session running now, staffed by the seeded proctor and tutor, with all three seeded students.
 * The seeded admin has no WWCC check, so it stands in for an adult who isn't cleared.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "../../scripts/lib/env";
import { SEED_IDS } from "../../scripts/seed-data";
import { signInAs, userIdOf } from "../helpers";

const service = createAdminClient();
let tutor: SupabaseClient;
let proctor: SupabaseClient;
let parentA: SupabaseClient;
let studentA: SupabaseClient;
let tutorId: string;
let proctorId: string;
let adminId: string;
let roomId: string;
let sessionId: string;
let laterSessionId: string;

beforeAll(async () => {
  [tutor, proctor, parentA, studentA] = await Promise.all([
    signInAs("tutor"),
    signInAs("proctor"),
    signInAs("parentA"),
    signInAs("studentA"),
  ]);
  [tutorId, proctorId, adminId] = await Promise.all([userIdOf("tutor"), userIdOf("proctor"), userIdOf("admin")]);

  const room = await service
    .from("rooms")
    .insert({ org_id: SEED_IDS.org, name: "RLS breakout room", video_url: "https://example.com/breakout-room", capacity: 5 })
    .select("id")
    .single();
  if (room.error) throw room.error;
  roomId = room.data.id;

  const now = Date.now();
  const insertSession = async (startsAt: number) => {
    const { data, error } = await service
      .from("sessions")
      .insert({
        room_id: roomId,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(startsAt + 4 * 3_600_000).toISOString(),
        proctor_id: proctorId,
        tutor_id: tutorId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };
  sessionId = await insertSession(now - 30 * 60_000); // running now
  laterSessionId = await insertSession(now + 2 * 86_400_000);

  const enrol = await service.from("enrolments").insert(
    [sessionId, laterSessionId].flatMap((id) => [
      { session_id: id, student_id: SEED_IDS.studentA },
      { session_id: id, student_id: SEED_IDS.studentA2 },
      { session_id: id, student_id: SEED_IDS.studentB },
    ]),
  );
  if (enrol.error) throw enrol.error;
});

afterAll(async () => {
  if (!roomId) return;
  await service.from("sessions").delete().eq("room_id", roomId); // cascades to breakouts and enrolments
  await service.from("rooms").delete().eq("id", roomId);
});

function start(client: SupabaseClient, students: string[], secondAdult: string | null = null, adult = tutorId, session = sessionId) {
  return client.rpc("start_breakout", {
    p_session: session,
    p_adult: adult,
    p_students: students,
    p_second_adult: secondAdult,
  });
}

describe("starting a breakout", () => {
  it("refuses one adult alone with one student", async () => {
    const { data, error } = await start(tutor, [SEED_IDS.studentA]);
    expect(data).toBeNull();
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("one adult alone with one student");
  });

  it("refuses the same student listed twice as if it were two", async () => {
    const { error } = await start(tutor, [SEED_IDS.studentA, SEED_IDS.studentA]);
    expect(error?.message).toContain("one adult alone with one student");
  });

  it("logs a breakout with two students, readable by the session's staff", async () => {
    const { data: id, error } = await start(tutor, [SEED_IDS.studentA, SEED_IDS.studentB]);
    expect(error).toBeNull();
    expect(typeof id).toBe("string");

    const { data: rows } = await proctor.rpc("session_breakouts", { p_session: sessionId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, ended_at: null, adult_name: "Tom Tutor", second_adult_name: null });
    expect(rows[0].students.map((s: { name: string }) => s.name)).toEqual(["Ava A.", "Noah B."]);
  });

  it("won't put a student or an adult in two open breakouts", async () => {
    const student = await start(proctor, [SEED_IDS.studentA, SEED_IDS.studentA2], null, proctorId);
    expect(student.error?.message).toContain("a student is already in an open breakout");
    const adult = await start(proctor, [SEED_IDS.studentA2], proctorId, tutorId);
    expect(adult.error?.message).toContain("an adult is already in an open breakout");
  });

  it("allows one student with a second cleared adult", async () => {
    const { error } = await start(proctor, [SEED_IDS.studentA2], tutorId, proctorId);
    // The tutor is still in the first breakout, so end that one first.
    expect(error?.message).toContain("an adult is already in an open breakout");

    const { data: rows } = await tutor.rpc("session_breakouts", { p_session: sessionId });
    const open = rows.find((r: { ended_at: string | null }) => !r.ended_at);
    expect((await tutor.rpc("end_breakout", { p_breakout: open.id })).error).toBeNull();

    const second = await start(proctor, [SEED_IDS.studentA2], tutorId, proctorId);
    expect(second.error).toBeNull();
    const { data: after } = await proctor.rpc("session_breakouts", { p_session: sessionId });
    expect(after[0]).toMatchObject({ adult_name: "Priya Proctor", second_adult_name: "Tom Tutor" });
    await proctor.rpc("end_breakout", { p_breakout: second.data });
  });

  it("refuses an adult without a verified WWCC, as lead or second adult", async () => {
    const lead = await start(tutor, [SEED_IDS.studentA, SEED_IDS.studentB], null, adminId);
    expect(lead.error?.message).toContain("Working with Children Check");
    const second = await start(tutor, [SEED_IDS.studentA], adminId);
    expect(second.error?.message).toContain("Working with Children Check");
  });

  it("refuses the same adult as both adults", async () => {
    const { error } = await start(tutor, [SEED_IDS.studentA], tutorId);
    expect(error?.message).toContain("someone else");
  });

  it("only logs breakouts while the session is running", async () => {
    const { error } = await start(tutor, [SEED_IDS.studentA, SEED_IDS.studentB], null, tutorId, laterSessionId);
    expect(error?.message).toContain("session is not open");
  });
});

describe("ending a breakout", () => {
  it("records the end time once; ending again changes nothing", async () => {
    const { data: id, error } = await start(tutor, [SEED_IDS.studentA, SEED_IDS.studentB]);
    expect(error).toBeNull();
    expect((await tutor.rpc("end_breakout", { p_breakout: id })).error).toBeNull();
    const first = await service.from("breakouts").select("ended_at").eq("id", id).single();
    expect(first.data?.ended_at).not.toBeNull();
    expect((await proctor.rpc("end_breakout", { p_breakout: id })).error).toBeNull();
    const again = await service.from("breakouts").select("ended_at").eq("id", id).single();
    expect(again.data?.ended_at).toBe(first.data?.ended_at);
  });
});

describe("who can see and change the log", () => {
  it("hides it from parents and students and refuses their writes", async () => {
    for (const client of [parentA, studentA]) {
      const read = await client.from("breakouts").select("id").eq("session_id", sessionId);
      expect(read.data).toEqual([]);
      const members = await client.from("breakout_students").select("student_id");
      expect(members.data).toEqual([]);
      const rpc = await client.rpc("session_breakouts", { p_session: sessionId });
      expect(rpc.data).toEqual([]);
      const write = await start(client, [SEED_IDS.studentA, SEED_IDS.studentB]);
      expect(write.error?.code).toBe("42501");
    }
  });

  it("is append-only for staff: no direct inserts, edits or deletes", async () => {
    const insert = await tutor
      .from("breakouts")
      .insert({ session_id: sessionId, adult_id: tutorId, logged_by: tutorId, started_at: new Date().toISOString() });
    expect(insert.error).not.toBeNull();

    const { data: rows } = await tutor.from("breakouts").select("id").eq("session_id", sessionId);
    expect(rows?.length).toBeGreaterThan(0);
    const id = rows![0].id;
    const update = await tutor.from("breakouts").update({ ended_at: null }).eq("id", id);
    expect(update.error).not.toBeNull();
    const del = await tutor.from("breakouts").delete().eq("id", id);
    expect(del.error).not.toBeNull();
    const still = await service.from("breakouts").select("id").eq("id", id);
    expect(still.data).toHaveLength(1);
  });

  it("lists cleared adults only, the session's tutor first", async () => {
    const { data } = await tutor.rpc("breakout_adults", { p_session: sessionId });
    const ids = (data ?? []).map((a: { id: string }) => a.id);
    expect(ids[0]).toBe(tutorId);
    expect(ids).toContain(proctorId);
    expect(ids).not.toContain(adminId);
    expect(data[0].session_role).toBe("tutor");
  });
});
