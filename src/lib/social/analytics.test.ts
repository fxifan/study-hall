import { describe, expect, it } from "vitest";
import { edumiMetrics, type EdumiRows } from "./analytics";

const r = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-08T00:00:00Z") };
const now = new Date("2026-11-08T00:00:00Z");
const rows: EdumiRows = {
  students: [
    { profile_id: "a", created_at: "2026-11-02T00:00:00Z", self_signed: true, social_enabled: true },
    { profile_id: "b", created_at: "2026-11-03T00:00:00Z", self_signed: true, social_enabled: true },
    { profile_id: "c", created_at: "2026-10-01T00:00:00Z", self_signed: false, social_enabled: true },
  ],
  plans: [
    { profile_id: "a", status: "active", payer: "parent", trial_ends_at: "2026-11-05T00:00:00Z" },
    { profile_id: "b", status: "trialing", payer: null, trial_ends_at: "2026-11-10T00:00:00Z" },
  ],
  groups: [{ id: "g", created_at: "2026-11-02T00:00:00Z" }],
  members: [
    { group_id: "g", profile_id: "a", joined_at: "2026-11-02T00:00:00Z" },
    { group_id: "g", profile_id: "b", joined_at: "2026-11-03T00:00:00Z" },
  ],
  sessions: [
    { profile_id: "a", group_id: "g", started_at: "2026-11-04T00:00:00Z", credited_seconds: 3600 },
    { profile_id: "b", group_id: "g", started_at: "2026-11-04T00:00:00Z", credited_seconds: 1800 },
  ],
  recaps: [{ day: "2026-11-04", created_at: "2026-11-05T00:00:00Z", done: 90, target: 60 }],
  help: [{ state: "resolved", created_at: "2026-11-04T00:00:00Z" }, { state: "open", created_at: "2026-11-04T00:00:00Z" }],
  messages: 12,
  resources: [{ profile_id: "a", kind: "quiz", created_at: "2026-11-04T00:00:00Z", curriculum: true, flagged: false }],
  attempts: [{ profile_id: "a", submitted_at: "2026-11-04T00:00:00Z", correct: 9, total: 12 }],
};

describe("Edumi student analytics", () => {
  it("adds up the pilot measures", () => {
    const m = edumiMetrics(rows, r, now);
    expect(m.acquisition).toMatchObject({ signups: 2, trialsStarted: 1, trialing: 1 });
    expect(m.plans).toMatchObject({ paying: 1, byParent: 1, mrrCents: 399, trialConversion: 1 });
    expect(m.groups).toMatchObject({ created: 1, active: 1, activeWithTwo: 1, goalsHit: 1, goalDays: 1, messages: 12 });
    expect(m.study).toMatchObject({ minutes: 90, studiers: 2 });
    expect(m.help.rate).toBe(0.5);
    expect(m.practice).toMatchObject({ quizzes: 1, curriculumShare: 1, avgScore: 0.75 });
    expect(m.funnel.map((f) => f.count)).toEqual([2, 2, 2, 1, 1]);
  });
});
