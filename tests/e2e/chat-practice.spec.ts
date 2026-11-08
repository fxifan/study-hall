/**
 * Group chat practice prompts (docs/study-ranks.md): the pinned strip shows the student's own rank
 * and points to the next one and opens Practice with a way back to the group; another member's
 * fresh rank-up shows a nudge in the conversation that can be dismissed. Other members never see
 * the student's points. Run the dev server with TUTOR_RESOURCES_OFFLINE=1.
 */
import { expect, test, type Browser } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";

loadEnv();
const admin = createAdminClient();
const stamp = Date.now();
const created: string[] = [];
let groupId = "";

async function student(name: string, points: number, tier: number) {
  const email = `chatprac-${name.toLowerCase()}-${stamp}@studyhall.test`;
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "student", org_id: org!.id } });
  const id = data.user!.id;
  created.push(id);
  await admin.from("students").insert({ org_id: org!.id, profile_id: id, first_name: name, last_initial: "T", year_level: 10, status: "active", self_signed: true, social_enabled: true });
  // A trial that started before card-required trials, so the test has full access.
  await admin.from("student_plans").insert({ profile_id: id });
  if (points) await admin.from("points_ledger").insert({ profile_id: id, lineage_id: crypto.randomUUID(), kind: "marks", points, day: "2026-11-01" });
  await admin.from("student_ranks").insert({ profile_id: id, tier });
  return { id, email, orgId: org!.id as string };
}

async function login(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
  await page.waitForURL(/\/student\/groups/);
  return page;
}

test.afterAll(async () => {
  if (groupId) {
    await admin.from("study_group_members").delete().eq("group_id", groupId);
    await admin.from("study_groups").delete().eq("id", groupId);
  }
  for (const id of created) {
    await admin.from("students").delete().eq("profile_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

test("the chat prompts practice, the quiz leads back, and a friend's rank-up nudges", async ({ browser }) => {
  test.setTimeout(150_000);
  const mia = await student("Mia", 45, 1);
  const leo = await student("Leo", 60, 2);
  const { data: g } = await admin.from("study_groups").insert({ org_id: mia.orgId, name: "Methods crew", created_by: mia.id }).select("id").single();
  groupId = g!.id as string;
  await admin.from("study_group_members").insert([
    { group_id: groupId, profile_id: mia.id, role: "owner" },
    { group_id: groupId, profile_id: leo.id, role: "member" },
  ]);
  await admin.from("rank_promotions").insert({ profile_id: leo.id, from_tier: 1, to_tier: 2, points: 60, seen_at: new Date().toISOString() });

  const page = await login(browser, mia.email);
  await page.goto(`/student/groups/${groupId}`);
  const strip = page.getByTestId("practice-strip");
  await expect(strip).toContainText("5 points to Bronze Braincell");
  await expect(strip).toContainText("60 left today");
  const nudge = page.getByTestId("rank-up-nudge");
  await expect(nudge).toContainText("Leo T. ranked up to Bronze Braincell");
  await expect(nudge).toContainText("Your move: 5 points to Bronze Braincell");

  // Dismissing the nudge keeps it gone after a reload.
  await nudge.getByRole("button", { name: "Dismiss" }).click();
  await expect(nudge).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("practice-strip")).toBeVisible();
  await expect(page.getByTestId("rank-up-nudge")).toHaveCount(0);

  // Practice from the strip, then back to the group from the marked quiz.
  await page.getByTestId("practice-strip").getByRole("link", { name: "Practice →" }).click();
  await expect(page).toHaveURL(new RegExp(`/student/practice\\?group=${groupId}`));
  await expect(page.getByRole("link", { name: "← Back to Methods crew" })).toBeVisible();
  await page.getByLabel("Subject and level").selectOption({ label: "Victorian Curriculum · Mathematics · Year 10" });
  await page.locator('input[name="point"]').first().check();
  await page.getByRole("button", { name: "Make my quiz" }).click();
  await expect(page.getByRole("button", { name: "Submit for marking" })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`group=${groupId}`));
  for (let i = 0; i < 6; i++) await page.getByRole("group", { name: `Question ${i + 1}` }).getByRole("radio").first().check();
  await page.getByLabel("Your answer to question 7").fill("It is 4 because you count on two.");
  await page.getByLabel("Your answer to question 8").fill("four");
  await page.getByRole("button", { name: "Submit for marking" }).click();
  await expect(page.getByText("10 / 12 marks")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape"); // the Bronze rank-up celebration
  await page.getByRole("link", { name: "Back to Methods crew →" }).click();
  await expect(page).toHaveURL(new RegExp(`/student/groups/${groupId}$`));
  await expect(page.getByTestId("practice-strip")).toContainText("95 points to Silver Striver");
  await expect(page.getByTestId("practice-strip")).toContainText("50 left today");

  // Leo sees his own strip, never Mia's points.
  const other = await login(browser, leo.email);
  await other.goto(`/student/groups/${groupId}`);
  await expect(other.getByTestId("practice-strip")).toContainText("90 points to Silver Striver");
  await expect(other.getByText("95 points")).toHaveCount(0);
});
