/**
 * Study Ranks (docs/study-ranks.md): a quiz that crosses a threshold celebrates the new rank once,
 * after the marks are shown; Esc dismisses it; a refresh or a second tab doesn't show it again;
 * reduced motion shows it still; promotions that piled up while away show one celebration for
 * the highest; another student never sees it. Run the dev server with TUTOR_RESOURCES_OFFLINE=1.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";

loadEnv();
const admin = createAdminClient();
const stamp = Date.now();
const created: string[] = [];

async function student(name: string, points: number, tier: number): Promise<{ id: string; email: string }> {
  const email = `ranks-${name.toLowerCase()}-${stamp}@studyhall.test`;
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "student", org_id: org!.id } });
  const id = data.user!.id;
  created.push(id);
  await admin.from("students").insert({ org_id: org!.id, profile_id: id, first_name: name, last_initial: "T", year_level: 10, status: "active", self_signed: true, social_enabled: true });
  // A trial that started before card-required trials, so the test has full access.
  await admin.from("student_plans").insert({ profile_id: id });
  if (points) await admin.from("points_ledger").insert({ profile_id: id, lineage_id: crypto.randomUUID(), kind: "marks", points, day: "2026-11-01" });
  await admin.from("student_ranks").insert({ profile_id: id, tier });
  return { id, email };
}

async function login(browser: Browser, email: string, options: { reducedMotion?: "reduce" } = {}): Promise<Page> {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
  await page.waitForURL(/\/student\/groups/);
  return page;
}

async function earnTenMarks(page: Page) {
  await page.goto("/student/practice");
  await page.getByLabel("Subject and level").selectOption({ label: "Victorian Curriculum · Mathematics · Year 10" });
  await page.locator('input[name="point"]').first().check();
  await page.getByRole("button", { name: "Make my quiz" }).click();
  await expect(page.getByRole("button", { name: "Submit for marking" })).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 6; i++) await page.getByRole("group", { name: `Question ${i + 1}` }).getByRole("radio").first().check();
  await page.getByLabel("Your answer to question 7").fill("It is 4 because you count on two.");
  await page.getByLabel("Your answer to question 8").fill("four");
  await page.getByRole("button", { name: "Submit for marking" }).click();
  await expect(page.getByText("10 / 12 marks")).toBeVisible({ timeout: 30_000 });
}

test.afterAll(async () => {
  for (const id of created) {
    await admin.from("students").delete().eq("profile_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

test("crossing a threshold celebrates once, after the marks, and only for that student", async ({ browser }) => {
  test.setTimeout(120_000);
  const mia = await student("Mia", 45, 1);
  const leo = await student("Leo", 0, 1);
  const page = await login(browser, mia.email);
  await page.goto("/student/ranks");
  await expect(page.getByTestId("current-rank")).toHaveText("Copper Crammer");
  for (const name of ["Copper Crammer", "Bronze Braincell", "Silver Striver", "Gold Grinder", "Platinum Prodigy", "Ruby Reviser", "Sapphire Scholar", "Emerald Einstein", "Amethyst Ace", "Diamond Demon", "Champion Challenger", "Master Mind", "Grandmaster Genius"]) {
    await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(1);
  }

  await earnTenMarks(page); // 45 + 10 = 55 → Bronze Braincell
  const dialog = page.getByRole("dialog", { name: "Bronze Braincell" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Rank up!", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Rank up! You're now Bronze Braincell." })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Nice!" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await admin.from("rank_promotions").select("to_tier, seen_at").eq("profile_id", mia.id)).data).toEqual([
    { to_tier: 2, seen_at: expect.any(String) },
  ]);

  // Refresh and a second tab: no second celebration. The rank shows everywhere.
  await page.goto("/student/me");
  await expect(page.getByText("Bronze Braincell").first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const tab2 = await page.context().newPage();
  await tab2.goto("/student/groups");
  await expect(tab2.getByRole("dialog")).toHaveCount(0);

  // Another student never sees it.
  const other = await login(browser, leo.email);
  await other.goto("/student/me");
  await expect(other.getByRole("dialog")).toHaveCount(0);
  await expect(other.getByText("Copper Crammer").first()).toBeVisible();
});

test("promotions earned while away show one celebration for the highest, still under reduced motion", async ({ browser }) => {
  const ava = await student("Ava", 600, 5);
  // Two unseen promotions (as if the awards happened on another device).
  await admin.from("rank_promotions").insert([
    { profile_id: ava.id, from_tier: 1, to_tier: 3, points: 200 },
    { profile_id: ava.id, from_tier: 3, to_tier: 5, points: 600 },
  ]);
  const page = await login(browser, ava.email, { reducedMotion: "reduce" });
  const dialog = page.getByRole("dialog", { name: "Platinum Prodigy" });
  await expect(dialog).toBeVisible();
  // Reduced motion: nothing animates; the badge and text are there at once.
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
  await page.getByRole("button", { name: "Nice!" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await admin.from("rank_promotions").select("seen_at").eq("profile_id", ava.id).is("seen_at", null)).data?.length).toBe(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a retried quiz submission adds no second promotion", async ({ browser }) => {
  test.setTimeout(120_000);
  const zed = await student("Zed", 40, 1);
  const page = await login(browser, zed.email);
  await earnTenMarks(page); // 50 → Bronze
  await page.getByRole("button", { name: "Nice!" }).click();
  // Retake for the same marks: no new points, no new promotion.
  await page.getByRole("button", { name: "Try again" }).click();
  for (let i = 0; i < 6; i++) await page.getByRole("group", { name: `Question ${i + 1}` }).getByRole("radio").first().check();
  await page.getByLabel("Your answer to question 7").fill("It is 4 because you count on two.");
  await page.getByLabel("Your answer to question 8").fill("four");
  await page.getByRole("button", { name: "Submit for marking" }).click();
  await expect(page.getByText("10 / 12 marks")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const { data } = await admin.from("rank_promotions").select("to_tier").eq("profile_id", zed.id);
  expect(data).toEqual([{ to_tier: 2 }]);
});

test("a half-done quiz survives a refresh and the draft clears once marked", async ({ browser }) => {
  test.setTimeout(120_000);
  const kim = await student("Kim", 0, 1);
  const page = await login(browser, kim.email);
  await page.goto("/student/practice");
  await page.getByLabel("Subject and level").selectOption({ label: "Victorian Curriculum · Mathematics · Year 10" });
  await page.locator('input[name="point"]').first().check();
  await page.getByRole("button", { name: "Make my quiz" }).click();
  await expect(page.getByRole("button", { name: "Submit for marking" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("group", { name: "Question 1" }).getByRole("radio").nth(1).check();
  await page.getByLabel("Your answer to question 7").fill("It is 4 because you count on two.");

  await page.reload();
  await expect(page.getByText("picked up where you left off")).toBeVisible();
  await expect(page.getByRole("group", { name: "Question 1" }).getByRole("radio").nth(1)).toBeChecked();
  await expect(page.getByLabel("Your answer to question 7")).toHaveValue("It is 4 because you count on two.");

  for (let i = 1; i < 6; i++) await page.getByRole("group", { name: `Question ${i + 1}` }).getByRole("radio").first().check();
  await page.getByLabel("Your answer to question 8").fill("four");
  await page.getByRole("button", { name: "Submit for marking" }).click();
  await expect(page.getByText(/\/ 12 marks/)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByText("0 of 8 answered")).toBeVisible();
});
