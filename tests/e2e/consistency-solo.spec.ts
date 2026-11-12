/**
 * Consistency and solo mode (docs/consistency-and-solo.md): study solo on one task, check in with a
 * line for tomorrow, earn the study day once, see the streak on Home, and change the daily goal.
 * Streak and rest-day rules are unit-tested in src/lib/social/consistency.test.ts.
 */
import { expect, test } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";

loadEnv();
const admin = createAdminClient();
const email = `e2e-solo-${Date.now()}@studyhall.test`;
let id = "";

test.afterAll(async () => {
  if (!id) return;
  await admin.from("students").delete().eq("profile_id", id);
  await admin.auth.admin.deleteUser(id);
});

test("study solo, check in, earn the study day once, and see the streak", async ({ page }) => {
  test.setTimeout(120_000);
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const u = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "student", org_id: org!.id } });
  id = u.data.user!.id;
  await admin.from("students").insert({ org_id: org!.id, profile_id: id, first_name: "Sol", last_initial: "T", year_level: 11, birth_year: 2010, birth_month: 1, status: "active", self_signed: true, social_enabled: true });
  await admin.from("student_plans").insert({ profile_id: id });
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
  await page.waitForURL(/\/student\/home/);

  // A new student: no streak yet, and a way to study without friends.
  await expect(page.getByTestId("streak-card")).toContainText("Start a streak today");
  await expect(page.getByTestId("streak-card")).toContainText("0 of 25 min today · or finish one thing");
  await page.getByTestId("study-solo").click();
  await expect(page).toHaveURL(/\/student\/solo$/);

  // One task, then the timer.
  await page.getByLabel("My own task").fill("Chem ch. 4, questions 1–5");
  await page.getByRole("button", { name: "Start studying" }).click();
  await expect(page.getByText("Working on")).toBeVisible();
  await expect(page.getByText("Chem ch. 4, questions 1–5").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  // Check in: finishing it makes today a study day.
  await page.getByText("Done", { exact: true }).click();
  await page.getByLabel("Tomorrow (optional)").fill("Questions 6–10");
  await page.getByRole("button", { name: "I'm done" }).click();
  await expect(page.getByTestId("solo-result")).toContainText("Study day counted · +5 points · 1-day streak");
  const { data: ledger } = await admin.from("points_ledger").select("kind, points").eq("profile_id", id);
  expect(ledger).toEqual([{ kind: "study_day", points: 5 }]);
  const { data: live } = await admin.from("study_sessions").select("state").eq("profile_id", id).neq("state", "stopped");
  expect(live).toEqual([]);

  // Home shows the streak and tomorrow's task, offered as the next thing to study.
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page.getByTestId("streak-card")).toContainText("1-day streak");
  await expect(page.getByTestId("streak-card")).toContainText("+5 today");
  // Home leads with it: one press starts tomorrow's task.
  await expect(page.getByTestId("tomorrow")).toContainText("Questions 6–10");
  await page.getByTestId("continue").getByRole("button", { name: "Start studying" }).click();
  await expect(page.getByText("Working on")).toBeVisible();

  // A second session the same day doesn't earn the study day twice.
  await page.getByText("Partly", { exact: true }).click();
  await page.getByRole("button", { name: "I'm done" }).click();
  await expect(page.getByTestId("solo-result")).toContainText("Study day counted · 1-day streak");
  const { data: again } = await admin.from("points_ledger").select("points").eq("profile_id", id);
  expect(again).toHaveLength(1);

  // The daily goal is the student's own.
  await page.goto("/student/me");
  await page.getByRole("button", { name: "15 min" }).click();
  await expect(page.getByRole("button", { name: "15 min" })).toHaveAttribute("aria-pressed", "true");
  const { data: settings } = await admin.from("student_settings").select("daily_goal_minutes").eq("profile_id", id).single();
  expect(settings).toEqual({ daily_goal_minutes: 15 });
});
