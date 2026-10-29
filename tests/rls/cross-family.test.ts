/**
 * RLS tests against the real Supabase project in .env.local (spec §5: "add tests that prove
 * cross-family data is not readable"). Needs `npm run db:migrate && npm run db:seed` first.
 * Run with `npm run test:rls`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "../../scripts/lib/env";
import { SEED_IDS } from "../../scripts/seed-data";
import { zonedDateTimeToUtc } from "../../src/lib/time";
import { signInAs, signedOutClient, sortedIds, userIdOf } from "../helpers";

const FAMILY_A = [SEED_IDS.studentA, SEED_IDS.studentA2].sort();
const FAMILY_B = [SEED_IDS.studentB];

let parentA: SupabaseClient;
let parentB: SupabaseClient;
let studentA: SupabaseClient;
let proctor: SupabaseClient;
let admin: SupabaseClient;
const service = createAdminClient();

beforeAll(async () => {
  [parentA, parentB, studentA, proctor, admin] = await Promise.all([
    signInAs("parentA"),
    signInAs("parentB"),
    signInAs("studentA"),
    signInAs("proctor"),
    signInAs("admin"),
  ]);
});

describe("parents only see their own family", () => {
  it("parent A lists only family A's students", async () => {
    const { data, error } = await parentA.from("students").select("id");
    expect(error).toBeNull();
    expect(sortedIds(data)).toEqual(FAMILY_A);
  });

  it("parent B lists only family B's students", async () => {
    const { data, error } = await parentB.from("students").select("id");
    expect(error).toBeNull();
    expect(sortedIds(data)).toEqual(FAMILY_B);
  });

  it("parent A gets nothing when asking for family B's student by id", async () => {
    const { data, error } = await parentA.from("students").select("*").eq("id", SEED_IDS.studentB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("parent A can't read family B's parent links, consents or profile", async () => {
    const links = await parentA.from("parent_students").select("student_id");
    expect(links.data?.map((l) => l.student_id).sort()).toEqual(FAMILY_A);

    const consents = await parentA.from("consents").select("id").eq("student_id", SEED_IDS.studentB);
    expect(consents.data).toEqual([]);

    const parentBId = await userIdOf("parentB");
    const profile = await parentA.from("profiles").select("id").eq("id", parentBId);
    expect(profile.data).toEqual([]);
  });

  it("parent A can't change family B's student", async () => {
    const { data } = await parentA
      .from("students")
      .update({ first_name: "Hacked" })
      .eq("id", SEED_IDS.studentB)
      .select("id");
    expect(data).toEqual([]);

    const check = await service.from("students").select("first_name").eq("id", SEED_IDS.studentB).single();
    expect(check.data?.first_name).toBe("Noah");
  });

  it("parent A can't attach themselves to family B's student", async () => {
    const parentAId = await userIdOf("parentA");
    const { error } = await parentA
      .from("parent_students")
      .insert({ parent_id: parentAId, student_id: SEED_IDS.studentB });
    expect(error?.code).toBe("42501");
  });

  it("parent A can't record consent for family B's student", async () => {
    const parentAId = await userIdOf("parentA");
    const { error } = await parentA.from("consents").insert({
      student_id: SEED_IDS.studentB,
      parent_id: parentAId,
      document: "house_rules",
      document_version: "test",
    });
    expect(error?.code).toBe("42501");
  });
});

describe("parents can't escalate", () => {
  it("a parent can edit their own student's details", async () => {
    const { data, error } = await parentA
      .from("students")
      .update({ school: "Example Secondary College" })
      .eq("id", SEED_IDS.studentA)
      .select("id");
    expect(error).toBeNull();
    expect(sortedIds(data)).toEqual([SEED_IDS.studentA]);
  });

  it("a parent can't change their own student's status", async () => {
    const { error } = await parentA.from("students").update({ status: "active" }).eq("id", SEED_IDS.studentA2);
    expect(error?.code).toBe("42501");
  });

  it("a parent can't make themselves an admin", async () => {
    const parentAId = await userIdOf("parentA");
    const { error } = await parentA.from("profiles").update({ role: "admin" }).eq("id", parentAId);
    expect(error?.code).toBe("42501");

    const check = await service.from("profiles").select("role").eq("id", parentAId).single();
    expect(check.data?.role).toBe("parent");
  });
});

describe("other roles", () => {
  it("student A sees only their own student record", async () => {
    const { data } = await studentA.from("students").select("id");
    expect(sortedIds(data)).toEqual([SEED_IDS.studentA]);
  });

  it("signed-out callers can't read students or profiles", async () => {
    const anon = signedOutClient();
    const students = await anon.from("students").select("id");
    const profiles = await anon.from("profiles").select("id");
    // anon has no table grants at all, so this is a permission error rather than an empty list.
    expect(students.data ?? []).toEqual([]);
    expect(profiles.data ?? []).toEqual([]);
    expect(students.error?.code).toBe("42501");
  });

  it("signed-out callers see active plans' public columns only", async () => {
    const anon = signedOutClient();
    const { data, error } = await anon.from("plans").select("id, name, price_cents, currency, interval, days_per_week");
    expect(error).toBeNull();
    expect(data).toEqual(expect.arrayContaining([expect.objectContaining({ id: SEED_IDS.plan, price_cents: 4900 })]));

    const secret = await anon.from("plans").select("stripe_price_id");
    expect(secret.error?.code).toBe("42501");

    const inactive = await service
      .from("plans")
      .insert({ org_id: SEED_IDS.org, name: "RLS test (inactive)", price_cents: 100, active: false })
      .select("id")
      .single();
    try {
      const hidden = await anon.from("plans").select("id").eq("id", inactive.data!.id);
      expect(hidden.data).toEqual([]);
    } finally {
      await service.from("plans").delete().eq("id", inactive.data!.id);
    }
  });

  it("the admin sees every student in the org", async () => {
    const { data } = await admin.from("students").select("id");
    expect(sortedIds(data)).toEqual(expect.arrayContaining([...FAMILY_A, ...FAMILY_B]));
  });

  it("a proctor with no sessions sees no students", async () => {
    const { data } = await proctor.from("students").select("id");
    expect(data).toEqual([]);
  });
});

describe("proctors only see students in sessions they're assigned to", () => {
  let sessionId: string;

  beforeAll(async () => {
    // A far-future session so it can't collide with real generated sessions.
    const { data, error } = await service
      .from("sessions")
      .insert({
        room_id: SEED_IDS.room,
        schedule_id: SEED_IDS.schedule,
        starts_at: zonedDateTimeToUtc("2099-01-05", "16:00").toISOString(),
        ends_at: zonedDateTimeToUtc("2099-01-05", "20:00").toISOString(),
        proctor_id: await userIdOf("proctor"),
      })
      .select("id")
      .single();
    if (error) throw error;
    sessionId = data.id;
    const enrol = await service.from("enrolments").insert({ session_id: sessionId, student_id: SEED_IDS.studentA });
    if (enrol.error) throw enrol.error;
  });

  afterAll(async () => {
    if (sessionId) await service.from("sessions").delete().eq("id", sessionId);
  });

  it("sees the rostered student and no one else", async () => {
    const { data } = await proctor.from("students").select("id");
    expect(sortedIds(data)).toEqual([SEED_IDS.studentA]);
  });

  it("can record attendance for a rostered student", async () => {
    const { error } = await proctor
      .from("attendance")
      .insert({ session_id: sessionId, student_id: SEED_IDS.studentA, status: "present" });
    expect(error).toBeNull();
  });

  it("can't record attendance for a student who isn't enrolled", async () => {
    const { error } = await proctor
      .from("attendance")
      .insert({ session_id: sessionId, student_id: SEED_IDS.studentB, status: "present" });
    expect(error?.code).toBe("42501");
  });

  it("parent B can't see family A's session or attendance", async () => {
    const sessions = await parentB.from("sessions").select("id").eq("id", sessionId);
    const attendance = await parentB.from("attendance").select("id").eq("session_id", sessionId);
    expect(sessions.data).toEqual([]);
    expect(attendance.data).toEqual([]);
  });

  it("parent A can see their student's session and attendance", async () => {
    const attendance = await parentA.from("attendance").select("student_id").eq("session_id", sessionId);
    expect(attendance.data).toEqual([{ student_id: SEED_IDS.studentA }]);
  });
});
