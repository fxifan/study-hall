/**
 * Session checklist and work evidence (owner brief, 30 Oct 2026): a student plans tasks, marks them
 * with a result, uploads a photo; a supervisor adds a check-in; the parent's report shows what was
 * marked, what was uploaded (not marked by Study Hall) and the check-in; another family can't open
 * the file. Restores what it changes.
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { SEED_IDS, seedEmail, type SeedAccount } from "../../scripts/seed-data";

loadEnv();
const admin = createAdminClient();
const BUCKET = "work-evidence";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
let roomId: string;
let liveSession: string;
let pastSession: string;
let pastEvidenceId: string;
const pastPath = `${SEED_IDS.studentA}/e2e-past/${crypto.randomUUID()}.png`;

async function logIn(page: Page, account: SeedAccount) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: seedEmail(account) });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
}

test.beforeAll(async () => {
  const room = await admin
    .from("rooms")
    .insert({ org_id: SEED_IDS.org, name: "Checklist room", video_url: "https://example.com/checklist-room", capacity: 5 })
    .select("id")
    .single();
  if (room.error) throw room.error;
  roomId = room.data.id;
  const tutorId = (await admin.from("profiles").select("id").eq("email", seedEmail("tutor")).single()).data!.id;
  const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  const sessions = await admin
    .from("sessions")
    .insert([
      { room_id: roomId, starts_at: at(-5), ends_at: at(115), tutor_id: tutorId }, // a two-hour block in progress
      { room_id: roomId, starts_at: at(-3 * 1440), ends_at: at(-3 * 1440 + 120) }, // finished three days ago
    ])
    .select("id, starts_at")
    .order("starts_at");
  if (sessions.error) throw sessions.error;
  [pastSession, liveSession] = sessions.data.map((s) => s.id);
  await admin.from("enrolments").insert([
    { session_id: liveSession, student_id: SEED_IDS.studentA },
    { session_id: pastSession, student_id: SEED_IDS.studentA },
  ]);

  // The finished session: one task with a photo and a templated check-in, for the parent's report.
  await admin.from("attendance").insert({ session_id: pastSession, student_id: SEED_IDS.studentA, check_in_at: at(-3 * 1440), check_out_at: at(-3 * 1440 + 110), status: "present" });
  const goal = await admin
    .from("goals")
    .insert({ session_id: pastSession, student_id: SEED_IDS.studentA, position: 1, text: "Exercise 4B, questions 1–15", subject: "Mathematical Methods", outcome: "done", result: "12/15" })
    .select("id")
    .single();
  await admin.storage.from(BUCKET).upload(pastPath, PNG, { contentType: "image/png" });
  const ev = await admin
    .from("goal_evidence")
    .insert({ goal_id: goal.data!.id, student_id: SEED_IDS.studentA, storage_path: pastPath, file_name: "exercise-4b.png", content_type: "image/png", size_bytes: PNG.length })
    .select("id")
    .single();
  pastEvidenceId = ev.data!.id;
  await admin.from("session_checkins").insert({
    session_id: pastSession,
    student_id: SEED_IDS.studentA,
    template_en: "Asked for help with schoolwork during the session.",
    template_zh: "学生在自习期间提出了学业求助。",
    created_by: tutorId,
  });
});

test.afterAll(async () => {
  if (!roomId) return;
  // Remove the uploaded files, then the sessions (goals and evidence rows go with them).
  const { data: goals } = await admin.from("goals").select("goal_evidence(storage_path)").in("session_id", [liveSession, pastSession]);
  const paths = (goals ?? []).flatMap((g) => (g.goal_evidence as { storage_path: string }[]).map((e) => e.storage_path));
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  await admin.from("sessions").delete().eq("room_id", roomId);
  await admin.from("rooms").delete().eq("id", roomId);
});

test("a student plans tasks, marks them and uploads a photo of the work", async ({ page }) => {
  await logIn(page, "studentA");
  await expect(page).toHaveURL("/student");
  await expect(page.getByTestId("today")).toContainText("Checklist room");

  await page.getByLabel("Subject 1").fill("Mathematical Methods");
  await page.getByLabel("Goal 1").fill("Exercise 4B, questions 1–15");
  await page.getByLabel("What you'll have to show (optional) 1").fill("Worked answers");
  await page.locator('input[name="minutes1"]').fill("45");
  await page.getByRole("button", { name: "Save goals" }).click();
  await expect
    .poll(async () => (await admin.from("goals").select("subject, expected_output, est_minutes").eq("session_id", liveSession).single()).data)
    .toEqual({ subject: "Mathematical Methods", expected_output: "Worked answers", est_minutes: 45 });

  // Joined (as the Join button records), so the marking step shows.
  await admin.from("attendance").insert({ session_id: liveSession, student_id: SEED_IDS.studentA, check_in_at: new Date().toISOString(), status: "present" });
  await page.reload();
  const task = page.getByRole("group", { name: "Exercise 4B, questions 1–15" });
  await expect(task).toContainText("Planned to show: Worked answers");

  // A wrong file type is refused before anything uploads.
  const fileInput = task.getByLabel("Add photo or file: Exercise 4B, questions 1–15");
  await fileInput.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(task.getByRole("alert")).toContainText("That file type isn't accepted");

  await fileInput.setInputFiles({ name: "Exercise 4B (page 1).png", mimeType: "image/png", buffer: PNG });
  await expect(task.getByRole("link", { name: "Exercise-4B-page-1.png" })).toBeVisible({ timeout: 15_000 });

  await task.getByLabel("Done", { exact: true }).check();
  await task.getByLabel(/Result/).fill("12/15");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await admin.from("goals").select("outcome, result").eq("session_id", liveSession).single()).data)
    .toEqual({ outcome: "done", result: "12/15" });

  // The file opens through the access-checked link, which hands out a short-lived signed URL.
  const evidence = await admin.from("goal_evidence").select("id").eq("student_id", SEED_IDS.studentA).order("created_at", { ascending: false }).limit(1).single();
  const res = await page.request.get(`/api/evidence/${evidence.data!.id}`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toMatch(/\/storage\/v1\/object\/sign\/work-evidence\//);
});

test("the session's tutor sees the plan and adds a check-in from a template", async ({ page }) => {
  await logIn(page, "tutor");
  await page.goto(`/proctor/session/${liveSession}`);
  const plan = page.getByTestId(`plan-${SEED_IDS.studentA}`);
  await expect(plan).toContainText("Mathematical Methods · Exercise 4B, questions 1–15");
  await plan.getByLabel("Template").selectOption({ label: "Phone visible once during the session." });
  await plan.getByRole("button", { name: "Add check-in" }).click();
  await expect(plan).toContainText("Phone visible once during the session.");
  await expect
    .poll(async () => (await admin.from("session_checkins").select("template_zh").eq("session_id", liveSession).single()).data)
    .toEqual({ template_zh: "本次学习期间，学生曾有一次手机出现在视线范围内。" });
});

test("the parent's report separates marked work, uploads and check-ins", async ({ page }) => {
  await logIn(page, "parentA");
  const card = page.getByTestId("report-list").locator("article", { hasText: "Exercise 4B, questions 1–15" });
  await expect(card).toContainText("1 done · 0 partly done · 0 not done · marked by the student");
  await expect(card).toContainText("Mathematical Methods · Exercise 4B, questions 1–15");
  await expect(card).toContainText("Result: 12/15");
  await expect(card.getByRole("link", { name: "exercise-4b.png" })).toHaveAttribute("href", `/api/evidence/${pastEvidenceId}`);
  await expect(card).toContainText("Uploaded by the student. Study Hall hasn't checked or marked it.");
  await expect(card).toContainText(/Supervisor observation\s*Asked for help with schoolwork during the session\./);

  await page.getByRole("button", { name: "简体中文" }).click();
  await expect(card).toContainText("学生在自习期间提出了学业求助。");
  await expect(card).toContainText("由学生上传，Study Hall 未检查或批改。");

  const res = await page.request.get(`/api/evidence/${pastEvidenceId}`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
});

test("another family can't open the work", async ({ page }) => {
  await logIn(page, "parentB");
  await expect(page.getByTestId("reports")).not.toContainText("Exercise 4B");
  const res = await page.request.get(`/api/evidence/${pastEvidenceId}`, { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});
