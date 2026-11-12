/**
 * Admin Student view: the admin overview's button opens the Edumi student app with the admin's own
 * preview student profile, with a banner back to admin. Uses the seeded admin@studyhall.test.
 */
import { expect, test } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";

loadEnv();
const admin = createAdminClient();
const email = "admin@studyhall.test";
let profileId = "";

test.afterAll(async () => {
  if (!profileId) return;
  await admin.from("student_ranks").delete().eq("profile_id", profileId);
  await admin.from("students").delete().eq("profile_id", profileId);
});

test("an admin opens Student view from the overview and gets back", async ({ page }) => {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  profileId = data.user!.id;
  await admin.from("students").delete().eq("profile_id", profileId);
  await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
  await page.waitForURL(/\/admin/);
  await page.getByRole("button", { name: "Student view →" }).click();
  await page.waitForURL(/\/student\/home/);
  await expect(page.getByText("Student view · you're seeing Edumi as a student")).toBeVisible();
  for (const path of ["/student/practice", "/student/friends", "/student/me", "/student/ranks"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(path));
  }
  await page.goto("/student");
  await page.waitForURL(/\/student\/home/);
  await page.getByRole("link", { name: "Back to admin" }).click();
  await page.waitForURL(/\/admin$/);
  // Opening it again reuses the same preview profile.
  await page.getByRole("button", { name: "Student view →" }).click();
  await page.waitForURL(/\/student\/home/);
  const { count } = await admin.from("students").select("id", { count: "exact", head: true }).eq("profile_id", profileId);
  expect(count).toBe(1);
});
