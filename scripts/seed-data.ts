/**
 * Fixed IDs and accounts for the dev seed (spec §11 Phase 0): 1 org, 1 admin, 1 proctor, 1 tutor,
 * 1 room, 1 schedule, plans at A$49/week (Supervised Study) and A$149/week (Study + Tutoring), and
 * 2 test families. Shared by scripts/seed.ts and the tests.
 * Fixed IDs make the seed idempotent: running it again updates rows instead of duplicating them.
 */

export const SEED_IDS = {
  org: "00000000-0000-4000-8000-000000000001",
  plan: "00000000-0000-4000-8000-000000000101",
  retiredTutoringPlan: "00000000-0000-4000-8000-000000000102", // A$79, replaced by the A$149 plan
  tutoringPlan: "00000000-0000-4000-8000-000000000103",
  room: "00000000-0000-4000-8000-000000000201",
  schedule: "00000000-0000-4000-8000-000000000301",
  proctorCheck: "00000000-0000-4000-8000-000000000401",
  tutorCheck: "00000000-0000-4000-8000-000000000402",
  studentA: "00000000-0000-4000-8000-00000000a001", // Family A, has a login
  studentA2: "00000000-0000-4000-8000-00000000a002", // Family A, invited, no login yet
  studentB: "00000000-0000-4000-8000-00000000b001", // Family B, has a login
} as const;

export type SeedAccount = "admin" | "proctor" | "tutor" | "parentA" | "studentA" | "parentB" | "studentB";

export const SEED_ACCOUNTS: Record<
  SeedAccount,
  { local: string; role: "admin" | "proctor" | "parent" | "student"; fullName: string }
> = {
  admin: { local: "admin", role: "admin", fullName: "Sam Admin" },
  proctor: { local: "proctor", role: "proctor", fullName: "Priya Proctor" },
  tutor: { local: "tutor", role: "proctor", fullName: "Tom Tutor" }, // tutors use the proctor role
  parentA: { local: "parent.a", role: "parent", fullName: "Alex Anderson" },
  studentA: { local: "student.a", role: "student", fullName: "Ava A." },
  parentB: { local: "parent.b", role: "parent", fullName: "Blake Brown" },
  studentB: { local: "student.b", role: "student", fullName: "Noah B." },
};

export function seedEmail(account: SeedAccount, domain = process.env.SEED_EMAIL_DOMAIN || "studyhall.test") {
  return `${SEED_ACCOUNTS[account].local}@${domain}`;
}

export const HOUSE_RULES_VERSION = "2026-10-v1";
export const PRIVACY_VERSION = "2026-10-draft-4"; // replace with reviewed text before launch
