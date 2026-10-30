/**
 * Admin tools (owner request, 30 Oct 2026): student profiles, bilingual report templates, Zoom
 * meetings for rooms, and admins using the supervisor pages. Restores what it changes.
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

test("admins see every student's profile", async ({ page }) => {
  await logIn(page, "admin");
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Students" }).click();
  const table = page.getByTestId("students");
  const ava = table.locator("tr", { hasText: "Ava A." });
  await expect(ava).toContainText("Alex Anderson");
  await expect(ava).toContainText(/Study \+ Tutoring\s*Tutoring/);
  await expect(table.locator("tr", { hasText: "Noah B." })).toContainText("Supervised Study");

  await page.getByLabel("Search name, school or email").fill("noah");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(table).not.toContainText("Ava A.");
  await expect(table).toContainText("Noah B.");

  await page.goto(`/admin/students/${SEED_IDS.studentA}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ava A. · Year 11");
  await expect(page.getByTestId("student-family")).toContainText("Alex Anderson");
  await expect(page.getByTestId("student-family")).toContainText("Study + Tutoring");
  await expect(page.getByTestId("student-subjects")).toContainText("Mathematical Methods· wants help");
  await expect(page.getByTestId("student-subjects")).toContainText("Current work: Methods: chain rule.");
  await expect(page.getByTestId("student-consents")).toContainText("Privacy & child safety");
});

test("admins manage bilingual report templates", async ({ page }) => {
  await logIn(page, "admin");
  await page.goto("/admin/templates");
  const observations = page.getByTestId("templates-observation");
  await expect(observations.getByRole("form", { name: "Phone visible once during the session." })).toBeVisible();

  const en = `Test template ${Date.now()}`;
  try {
    const add = page.getByRole("form", { name: "Add template" });
    await add.getByLabel("Type").selectOption("comment");
    await add.getByLabel("English").fill(en);
    await add.getByLabel("简体中文").fill("测试模板");
    await add.getByRole("button", { name: "Add template" }).click();
    const row = page.getByTestId("templates-comment").getByRole("form", { name: en });
    await expect(row).toBeVisible();
    await row.getByLabel("In use").uncheck();
    await row.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(async () => (await admin.from("report_templates").select("active, text_zh").eq("text_en", en).single()).data)
      .toEqual({ active: false, text_zh: "测试模板" });
  } finally {
    await admin.from("report_templates").delete().eq("text_en", en);
  }
});

test("rooms say when Zoom isn't connected, and keep the manual link", async ({ page }) => {
  test.skip(Boolean(process.env.ZOOM_CLIENT_ID), "Zoom is configured locally");
  await logIn(page, "admin");
  await page.goto("/admin/rooms");
  await expect(page.getByTestId("zoom-status")).toContainText("Zoom isn't connected");
  await expect(page.getByRole("form", { name: "Zoom: Room 1" }).getByRole("button", { name: "Create Zoom meeting" })).toBeDisabled();
  await expect(page.getByRole("form", { name: "Room 1" }).getByLabel(/Video link/)).toBeVisible();
});

test("admins can use the supervisor pages; supervisors can't use admin pages", async ({ page }) => {
  await logIn(page, "admin");
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: /Supervise/ }).click();
  await expect(page).toHaveURL("/proctor");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/today's sessions/i);

  await logIn(page, "proctor");
  await page.goto("/admin/students");
  await expect(page).toHaveURL("/proctor");
});
