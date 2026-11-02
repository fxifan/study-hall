/**
 * Tutor product key flow (docs/tutor-reports-spec.md §9 M1–M3), on a phone-sized screen: sign up,
 * add a student, log typed notes, review and send the report, then invoice the session as a
 * GST-registered tutor and mark it paid. Runs without OpenAI or Resend keys (local stand-ins).
 */
import { devices, expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";

loadEnv();
const admin = createAdminClient();
const email = `e2e-tutor-${Date.now()}@studyhall.test`;

test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });

async function logIn(page: Page) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
}

test.afterAll(async () => {
  const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (data) {
    await admin.from("tutor_invoices").delete().eq("tutor_id", data.id); // restrict FKs first
    await admin.from("tutor_sessions").delete().eq("tutor_id", data.id);
    await admin.auth.admin.deleteUser(data.id);
  }
});

test("sign up, log a session, send the report, invoice it", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/tutors");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Parent updates in 60 seconds");
  await page.fill("input[name=name]", "Robin Tutor");
  await page.fill("input[name=email]", email);
  await page.check("input[name=terms]");
  await page.click('button:has-text("Start free trial")');
  await expect(page.getByText("for a sign-in link")).toBeVisible();

  await logIn(page);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(/Free trial: 14 days left/)).toBeVisible();

  // First student, straight into logging.
  await page.goto("/app/log");
  await page.fill("input[name=firstName]", "Mia");
  await page.fill("input[name=lastInitial]", "k");
  await page.fill("input[name=subjects]", "English");
  await page.fill("input[name=parentName]", "Sam Kim");
  await page.fill("input[name=parentEmail]", `parent-${email}`);
  await page.click('button:has-text("Add and log a session")');
  await page.waitForLoadState("networkidle");
  await page.fill("textarea", "We went through Mia's essay introduction for The Crucible and fixed the thesis statement together.");
  await page.click('button:has-text("Draft report")');
  await expect(page).toHaveURL(/\/app\/reports\//, { timeout: 30_000 });
  await expect(page.getByText("Session", { exact: false }).first()).toBeVisible();
  await page.click('button:has-text("Send to")');
  await expect(page.getByText(/Sent to|test mode/)).toBeVisible({ timeout: 15_000 });

  // GST-registered, then invoice the session.
  await page.goto("/app/settings");
  await page.fill("input[name=abn]", "51824753556");
  await page.check("input[name=gstRegistered]");
  await page.click('button:has-text("Save settings")');
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.goto("/app/invoices");
  await page.getByRole("link", { name: /Sam Kim/ }).click();
  await page.click('button:has-text("Create invoice")');
  await expect(page).toHaveURL(/\/app\/invoices\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tax invoice INV-0001");
  await expect(page.getByText("GST included")).toBeVisible();
  const pdf = await page.request.get(page.url().replace(/\/app\/invoices\/([^?]+).*/, "/api/tutor/invoices/$1/pdf"));
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await page.click('button:has-text("Send to")');
  await expect(page.getByRole("button", { name: "Mark as paid" })).toBeVisible({ timeout: 20_000 });
  await page.click('button:has-text("Mark as paid")');
  await expect(page.getByText("Marked as paid.")).toBeVisible();
});

test("a parent can't use the tutor app", async ({ page }) => {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: "parent.a@studyhall.test" });
  if (!data.properties) throw new Error("no link");
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/parent/);
  expect((await page.request.post("/api/tutor/draft", { multipart: { notes: "x" } })).status()).toBe(401);
});
