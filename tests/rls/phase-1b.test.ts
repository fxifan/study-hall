/**
 * Phase 1B database rules against the real Supabase project: the WWCC gate, room capacity,
 * student check-in/out, and public legal documents. Uses its own throwaway room.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "../../scripts/lib/env";
import { SEED_IDS } from "../../scripts/seed-data";
import { signInAs, signedOutClient, userIdOf } from "../helpers";

const service = createAdminClient();
let studentA: SupabaseClient;
let studentB: SupabaseClient;
let roomId: string;
let liveSession: string;
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

beforeAll(async () => {
  [studentA, studentB] = await Promise.all([signInAs("studentA"), signInAs("studentB")]);
  const room = await service
    .from("rooms")
    .insert({ org_id: SEED_IDS.org, name: "RLS test room", video_url: "https://example.com/test-room", capacity: 1 })
    .select("id")
    .single();
  if (room.error) throw room.error;
  roomId = room.data.id;

  // A session that started 5 minutes ago, so check-in is open.
  const session = await service
    .from("sessions")
    .insert({ room_id: roomId, starts_at: minutesFromNow(-5), ends_at: minutesFromNow(235) })
    .select("id")
    .single();
  if (session.error) throw session.error;
  liveSession = session.data.id;
});

afterAll(async () => {
  if (!roomId) return;
  await service.from("sessions").delete().eq("room_id", roomId);
  await service.from("rooms").delete().eq("id", roomId);
});

describe("WWCC gate", () => {
  it("rejects a supervisor whose check has expired by the session date", async () => {
    const { error } = await service
      .from("sessions")
      .insert({
        room_id: roomId,
        starts_at: "2031-01-06T05:00:00Z", // the seeded check expires 2030-12-31
        ends_at: "2031-01-06T09:00:00Z",
        proctor_id: await userIdOf("proctor"),
      });
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/Working with Children Check/);
  });

  it("rejects assigning someone who isn't a proctor", async () => {
    const { error } = await service.from("sessions").update({ proctor_id: await userIdOf("parentA") }).eq("id", liveSession);
    expect(error?.code).toBe("23514");
  });

  it("accepts a verified, current proctor", async () => {
    const { error } = await service.from("sessions").update({ proctor_id: await userIdOf("proctor") }).eq("id", liveSession);
    expect(error).toBeNull();
  });
});

describe("room capacity", () => {
  it("enrols up to capacity and refuses the next student", async () => {
    const first = await service.from("enrolments").insert({ session_id: liveSession, student_id: SEED_IDS.studentA });
    expect(first.error).toBeNull();
    const second = await service.from("enrolments").insert({ session_id: liveSession, student_id: SEED_IDS.studentB });
    expect(second.error?.code).toBe("23514");
    expect(second.error?.message).toMatch(/full/);
  });
});

describe("check-in and check-out", () => {
  it("needs a goal before joining", async () => {
    const { error } = await studentA.rpc("check_in", { p_session: liveSession });
    expect(error?.message).toMatch(/goal/);
  });

  it("checks in, returns the video link, and checks out", async () => {
    const goal = await studentA
      .from("goals")
      .insert({ session_id: liveSession, student_id: SEED_IDS.studentA, position: 1, text: "Methods: Exercise 4B" });
    expect(goal.error).toBeNull();

    const join = await studentA.rpc("check_in", { p_session: liveSession });
    expect(join.error).toBeNull();
    expect(join.data).toBe("https://example.com/test-room");

    const leave = await studentA.rpc("check_out", { p_session: liveSession });
    expect(leave.error).toBeNull();

    const row = await service
      .from("attendance")
      .select("status, check_in_at, check_out_at")
      .eq("session_id", liveSession)
      .eq("student_id", SEED_IDS.studentA)
      .single();
    expect(row.data?.status).toBe("present");
    expect(row.data?.check_in_at).not.toBeNull();
    expect(row.data?.check_out_at).not.toBeNull();
  });

  it("won't check in a student who isn't enrolled", async () => {
    const { error } = await studentB.rpc("check_in", { p_session: liveSession });
    expect(error?.code).toBe("42501");
  });

  it("isn't callable by signed-out visitors", async () => {
    const { error } = await signedOutClient().rpc("check_in", { p_session: liveSession });
    expect(error).not.toBeNull();
  });
});

describe("legal documents", () => {
  it("are readable by anyone, with the privacy notice marked as a draft", async () => {
    const { data, error } = await signedOutClient().from("legal_documents").select("document, version, is_draft");
    expect(error).toBeNull();
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ document: "house_rules", is_draft: false }),
        expect.objectContaining({ document: "privacy_child_safety", is_draft: true }),
      ]),
    );
  });

  it("can't be changed by a parent", async () => {
    const parent = await signInAs("parentA");
    const { data } = await parent.from("legal_documents").update({ title: "Hacked" }).eq("document", "house_rules").select("id");
    expect(data).toEqual([]);
  });
});
