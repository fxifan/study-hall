/**
 * Tutoring plan and study profiles: a parent edits a child's subjects, the tutor sees them on the
 * session roster with tutoring students first, and admins see subject demand. Family A is on the
 * tutoring plan (scripts/seed.ts). Restores what it changes.
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { SEED_IDS, seedEmail, type SeedAccount } from "../../scripts/seed-data";

loadEnv();
const admin = createAdminClient();

async function logIn(page: Page, account: SeedAccount) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: seedEmail(account) });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
}

test.beforeAll(async ({ request }) => {
  // Make sure the coming week's sessions exist, staffed and enrolled (what the daily cron does).
  const res = await request.get("/api/cron/generate-sessions", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.ok()).toBe(true);
});

test("a parent records a child's subjects from their page", async ({ page }) => {
  await logIn(page, "parentA");
  await expect(page).toHaveURL("/parent");
  const leo = page.getByTestId("student-list").locator("li", { hasText: "Leo" });
  await leo.getByRole("link", { name: "Subjects (0)" }).click();
  await expect(page).toHaveURL(`/parent/student/${SEED_IDS.studentA2}`);
  try {
    // Year 9: junior subjects only
    await expect(page.getByRole("group", { name: "VCE (Years 10–12)" })).toHaveCount(0);
    await page.getByLabel("Mathematics: Wants help").check();
    await page.getByLabel("Science: Takes").check();
    await page.getByRole("button", { name: "Save subjects" }).click();
    await expect(page.getByLabel("Mathematics: Takes")).toBeChecked(); // wanting help implies taking
    await page.getByRole("link", { name: /Back to your students/ }).click();
    await expect(page.getByTestId("student-list").locator("li", { hasText: "Leo" })).toContainText("Subjects (2)");
  } finally {
    await admin.from("student_subjects").delete().eq("student_id", SEED_IDS.studentA2);
  }
});

test("another family's child isn't reachable", async ({ page }) => {
  await logIn(page, "parentB");
  await page.goto(`/parent/student/${SEED_IDS.studentA}`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByText("Ava")).toHaveCount(0);
});

test("the tutor sees the roster with subjects, tutoring students first", async ({ page }) => {
  await logIn(page, "tutor");
  await expect(page).toHaveURL("/proctor");
  const sessions = page.getByTestId("upcoming-sessions").or(page.getByTestId("today-sessions")).first();
  await expect(sessions).toContainText("Tutoring");
  await sessions.getByRole("link", { name: /Roster/ }).first().click();
  const roster = page.getByTestId("roster");
  const first = roster.locator("> li").first();
  await expect(first).toContainText("Ava A.");
  await expect(first).toContainText("Tutoring plan");
  await expect(first).toContainText("Mathematical Methods· wants help");
  await expect(first).toContainText("Current work: Methods: chain rule.");
});

test("admins see subject demand and who's on the tutoring plan", async ({ page }) => {
  await logIn(page, "admin");
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Subjects" }).click();
  const methods = page.getByTestId("subject-demand").locator("tr", { hasText: "Mathematical Methods" });
  await expect(methods).toContainText("11");
  await expect(page.getByTestId("tutoring-students")).toContainText("Ava A.");
});
