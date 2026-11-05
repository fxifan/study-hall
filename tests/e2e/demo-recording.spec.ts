/**
 * Demo walkthrough recording (coding action plan §3, P1): a real run of Edumi for Tutors with
 * fictional data, recorded as video by Playwright. Skipped unless RECORD_DEMO=1. Uses the real AI
 * (run the dev server without TUTOR_RESOURCES_OFFLINE), a demo tutor created for the run and
 * deleted after it, and a fictional parent at example.com (nothing is emailed: sending opens the
 * tutor's own email app). The video is saved under test-results/ for editing.
 *   RECORD_DEMO=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/demo-recording.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";

loadEnv();
test.skip(process.env.RECORD_DEMO !== "1", "records the demo video only when RECORD_DEMO=1");
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } }, viewport: { width: 1280, height: 800 } });

const admin = createAdminClient();
const pause = (page: Page, ms = 1400) => page.waitForTimeout(ms);

test("Edumi for Tutors: log a lesson, review the AI report, invoice it", async ({ page }) => {
  test.setTimeout(240_000);
  page.on("dialog", (d) => d.accept());
  const email = `demo-${Date.now()}@example.com`;
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const { data: user, error } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "tutor", org_id: org!.id } });
  if (error) throw error;
  const id = user.user.id;
  try {
    await admin.from("tutors").insert({ id, display_name: "Alex Chen" });
    const fam = (await admin.from("tutor_families").insert({ tutor_id: id, parent_name: "Jordan Lee", parent_email: "jordan.lee@example.com" }).select("id").single()).data!;
    await admin.from("tutor_students").insert({ tutor_id: id, family_id: fam.id, first_name: "Mia", last_initial: "L", year_level: 10, subjects: ["Mathematics"] });
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    await page.goto(`/auth/confirm?token_hash=${link!.properties!.hashed_token}&type=magiclink`);

    // 1. The dashboard.
    await expect(page).toHaveURL(/\/app$/);
    await pause(page, 2500);

    // 2. Log a lesson with a typed note (a voice note works the same way).
    await page.goto("/app/log");
    await pause(page);
    await page.locator("textarea").pressSequentially(
      "Worked on quadratic equations with Mia. She can now factorise simple quadratics confidently but still mixes up signs when completing the square. Homework: exercise 4C questions 1 to 10.",
      { delay: 18 },
    );
    await pause(page);
    await page.click('button:has-text("Draft report")');

    // 3. The AI draft, ready to check and edit.
    await expect(page).toHaveURL(/\/app\/reports\//, { timeout: 60_000 });
    await expect(page.getByTestId("ai-check-note")).toBeVisible();
    await pause(page, 4000);
    await page.mouse.wheel(0, 400);
    await pause(page, 2500);

    // 4. Send it from the tutor's own email (no message actually leaves).
    const mail = page.getByRole("link", { name: /Open in my email/ });
    await mail.scrollIntoViewIfNeeded();
    await pause(page);
    await mail.click(); // a mailto link: a headless browser has no email app, so nothing is sent
    await page.click('button:has-text("I\'ve sent it")', { timeout: 10_000 });
    await expect(page.getByText(/Sent from your email to/)).toBeVisible({ timeout: 15_000 });
    await pause(page, 2000);

    // 5. Invoice the lesson.
    await page.goto("/app/invoices");
    await pause(page);
    await page.getByRole("link", { name: /Jordan Lee/ }).click();
    await pause(page);
    await page.click('button:has-text("Create invoice")');
    await expect(page).toHaveURL(/\/app\/invoices\/[0-9a-f-]+/);
    await pause(page, 3500);

    // 6. Back to the dashboard.
    await page.goto("/app");
    await pause(page, 3000);
  } finally {
    await admin.from("tutor_invoices").delete().eq("tutor_id", id);
    await admin.from("tutor_sessions").delete().eq("tutor_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});
