/**
 * Admin pages (spec Phase 1): rooms (capacity), schedule (generate, WWCC gate on supervisor and
 * tutor assignment, cancel/restore), plans, and supervisors' WWCC status. Restores what it changes.
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { SEED_IDS, seedEmail } from "../../scripts/seed-data";

loadEnv();
const admin = createAdminClient();

async function logInAsAdmin(page: Page) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: seedEmail("admin") });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
  await expect(page).toHaveURL("/admin");
}

test("rooms: capacity is editable", async ({ page }) => {
  await logInAsAdmin(page);
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Rooms" }).click();
  const room = page.getByRole("form", { name: "Room 1" });
  try {
    await room.getByLabel("Capacity").fill("35");
    await room.getByRole("button", { name: "Save room" }).click();
    await expect.poll(async () => (await admin.from("rooms").select("capacity").eq("id", SEED_IDS.room).single()).data?.capacity).toBe(35);
  } finally {
    await admin.from("rooms").update({ capacity: 40 }).eq("id", SEED_IDS.room);
  }
});

test("schedule: generate sessions, WWCC gate on assignment, cancel and restore", async ({ page }) => {
  await logInAsAdmin(page);
  await page.goto("/admin/schedule");
  await page.getByRole("button", { name: "Generate sessions now" }).click();
  await expect(page.getByRole("status")).toContainText(/Created \d+ sessions/);

  const first = page.getByTestId("upcoming-sessions").locator("li").first();
  await expect(first).toContainText(/\d+\/40 enrolled/);

  // The seeded admin has no WWCC, so assigning them is refused.
  await first.getByLabel("Supervisor").selectOption({ label: "Sam Admin" });
  await first.getByRole("button", { name: "Assign" }).first().click();
  // Filter: Next's route announcer is also role="alert".
  await expect(page.getByRole("alert").filter({ hasText: "no verified Working with Children Check" })).toBeVisible();
  // Same gate for tutors.
  await page.goto("/admin/schedule");
  await first.getByLabel("Tutor").selectOption({ label: "Sam Admin" });
  await first.getByRole("button", { name: "Assign" }).nth(1).click();
  await expect(page.getByRole("alert").filter({ hasText: "no verified Working with Children Check" })).toBeVisible();

  await first.getByRole("button", { name: "Cancel session" }).click();
  await expect(first.getByRole("button", { name: "Restore" })).toBeVisible();
  await first.getByRole("button", { name: "Restore" }).click();
  await expect(first.getByRole("button", { name: "Cancel session" })).toBeVisible();
});

test("plans and supervisors show their status", async ({ page }) => {
  await logInAsAdmin(page);
  await page.goto("/admin/plans");
  await expect(page.getByRole("form", { name: "Supervised Study" })).toContainText("A$49");
  await expect(page.getByRole("form", { name: "Study + Tutoring" })).toContainText(/A\$149\s*Tutoring/);

  await page.goto("/admin/proctors");
  const priya = page.getByTestId("supervisors").locator("li", { hasText: "Priya Proctor" });
  await expect(priya).toContainText("Verified");
  await expect(priya).toContainText("TEST-0000000-0");
});
