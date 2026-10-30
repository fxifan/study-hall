/**
 * Fixed IDs and accounts for the dev seed (spec §11 Phase 0): 1 org, 1 admin, 1 proctor, 1 tutor,
 * 1 room, 1 schedule, plans at A$99/week (Supervised Study) and A$199/week (Study + Tutoring), and
 * 2 test families. Shared by scripts/seed.ts and the tests.
 * Fixed IDs make the seed idempotent: running it again updates rows instead of duplicating them.
 */

export const SEED_IDS = {
  org: "00000000-0000-4000-8000-000000000001",
  plan: "00000000-0000-4000-8000-000000000104", // Supervised Study, A$99
  tutoringPlan: "00000000-0000-4000-8000-000000000105", // Study + Tutoring, A$199
  // Earlier prices, closed to new sign-ups. Families already on them keep them (and their price).
  retiredPlans: [
    "00000000-0000-4000-8000-000000000101", // Supervised Study, A$49
    "00000000-0000-4000-8000-000000000102", // Weeknights + tutoring, A$79
    "00000000-0000-4000-8000-000000000103", // Study + Tutoring, A$149
  ],
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

// Starter report-writing templates (admins edit them at /admin/templates). Factual observations
// only, never judgements about ability or attitude. The Chinese wording follows the owner-approved
// sample report.
export const STARTER_TEMPLATES: { id: string; kind: "observation" | "comment"; en: string; zh: string }[] = [
  { id: "00000000-0000-4000-8000-000000000501", kind: "observation", en: "Phone visible once during the session.", zh: "本次学习期间，学生曾有一次手机出现在视线范围内。" },
  { id: "00000000-0000-4000-8000-000000000502", kind: "observation", en: "Phone visible more than once during the session.", zh: "本次学习期间，学生的手机多次出现在视线范围内。" },
  { id: "00000000-0000-4000-8000-000000000503", kind: "observation", en: "Off camera for part of the session.", zh: "本次学习期间，学生有一段时间不在镜头内。" },
  { id: "00000000-0000-4000-8000-000000000504", kind: "observation", en: "Joined after the session started.", zh: "学生在自习开始后才加入。" },
  { id: "00000000-0000-4000-8000-000000000505", kind: "observation", en: "Left before the session ended.", zh: "学生在自习结束前离开。" },
  { id: "00000000-0000-4000-8000-000000000506", kind: "observation", en: "Asked for help with schoolwork during the session.", zh: "学生在自习期间提出了学业求助。" },
  { id: "00000000-0000-4000-8000-000000000511", kind: "comment", en: "Had a one-hour tutoring period this session.", zh: "本节自习安排了一小时辅导。" },
  { id: "00000000-0000-4000-8000-000000000512", kind: "comment", en: "Set three goals and marked each one before leaving.", zh: "设定了三个学习目标，并在离开前逐一标记。" },
];

export const HOUSE_RULES_VERSION = "2026-10-v1";
export const PRIVACY_VERSION = "2026-10-draft-6"; // replace with reviewed text before launch
