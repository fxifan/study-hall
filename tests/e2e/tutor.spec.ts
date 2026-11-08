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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Keep students moving between lessons.");
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
  // No sending domain locally: the report opens in the tutor's own email app, then they confirm.
  const mail = page.getByRole("link", { name: /Open in my email/ });
  await expect(mail).toHaveAttribute("href", new RegExp(`^mailto:parent-${email.replace(/[.]/g, "\\.")}\\?subject=Mia%20K\\.`));
  await mail.click();
  await page.click('button:has-text("I\'ve sent it")');
  await expect(page.getByText(/Sent from your email to/)).toBeVisible({ timeout: 15_000 });

  // GST-registered, then invoice the session.
  await page.goto("/app/settings");
  await page.fill("input[name=abn]", "51824753556");
  await page.check("input[name=gstRegistered]");
  await page.click('button:has-text("Save settings")');
  // Wait for the save itself: the bank help text also contains "saved.".
  await expect(page).toHaveURL(/[?&]saved=1/);
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await page.goto("/app/invoices");
  await page.getByRole("link", { name: /Sam Kim/ }).click();
  await page.click('button:has-text("Create invoice")');
  await expect(page).toHaveURL(/\/app\/invoices\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tax invoice INV-0001");
  await expect(page.getByText("GST included")).toBeVisible();
  const pdf = await page.request.get(page.url().replace(/\/app\/invoices\/([^?]+).*/, "/api/tutor/invoices/$1/pdf"));
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await expect(page.getByRole("link", { name: "1. Download PDF" })).toHaveAttribute("download", "Tax-invoice-INV-0001.pdf");
  await page.getByRole("link", { name: "2. Open email" }).click();
  await page.click('button:has-text("I\'ve sent it")');
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

test("dashboard: /tutors opens it, schedule a lesson, save and copy a Zoom link, calendar feed", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const dashEmail = `e2e-dash-${Date.now()}@studyhall.test`;
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const user = await admin.auth.admin.createUser({ email: dashEmail, email_confirm: true, app_metadata: { role: "tutor", org_id: org!.id } });
  const id = user.data.user!.id;
  try {
    await admin.from("tutors").insert({ id, display_name: "Dana Tutor" });
    const fam = await admin.from("tutor_families").insert({ tutor_id: id, parent_name: "P", parent_email: `p-${dashEmail}` }).select("id").single();
    await admin.from("tutor_students").insert({ tutor_id: id, family_id: fam.data!.id, first_name: "Zoe", last_initial: "Q", year_level: 10, subjects: ["Biology"], goals: "Cell biology" });
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: dashEmail });
    await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);

    await page.goto("/tutors");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Dana");
    await expect(page.getByTestId("students-panel")).toContainText("Year 10 · Biology");
    // A student but nothing booked: scheduling is the main action.
    await expect(page.getByTestId("dashboard-actions")).toHaveAttribute("data-next", "schedule_lesson");
    await expect(page.getByTestId("upcoming-lessons")).toContainText("Nothing booked yet.");
    await expect(page.getByTestId("payments-panel")).toContainText("Nothing outstanding");

    await page.getByRole("button", { name: "Schedule a lesson" }).first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator("select").first().selectOption({ label: "Zoe Q." });
    await dialog.locator('input[type="time"]').fill("23:30");
    await dialog.getByRole("button", { name: "Schedule" }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.locator('button[title^="Zoe Q."][title*="11:30pm"]:visible')).toHaveCount(1);
    await expect(page.getByTestId("upcoming-lessons")).toContainText("Zoe Q.");

    const links = page.locator("#meeting-links");
    await page.getByRole("button", { name: "Add a class link" }).click();
    await links.locator("#new-link-url").fill("https://example.com/meeting");
    await links.getByPlaceholder("My regular classroom").fill("Zoe's room");
    await links.getByRole("button", { name: "Save link" }).click();
    await expect(links.getByText("Only Zoom links")).toBeVisible();
    await links.locator("#new-link-url").fill("https://zoom.us/j/1234567890");
    await links.getByRole("button", { name: "Save link" }).click();
    await expect(links.getByText("Zoe's room")).toBeVisible();
    await links.getByRole("button", { name: "Copy" }).click();
    await expect(links.getByText("Copied ✓")).toBeVisible();
    // The lesson now has a class link one tap away (Zoe's own link).
    await page.reload();
    await expect(page.getByTestId("upcoming-lessons").getByRole("link", { name: /Open Zoe's room/ })).toHaveAttribute("href", "https://zoom.us/j/1234567890");

    await page.getByRole("button", { name: "Set up calendar link" }).click();
    const webcal = await page.getByRole("link", { name: "Add to Apple Calendar" }).getAttribute("href");
    const ics = await (await page.request.get(webcal!.replace("webcal://", "http://"))).text();
    expect(ics).toContain("SUMMARY:Tutoring: Zoe Q. (Biology)");
  } finally {
    await admin.auth.admin.deleteUser(id);
  }
});

test("before your next lesson: set a next step, mark them stuck, see where to start", async ({ page }) => {
  const stepEmail = `e2e-steps-${Date.now()}@studyhall.test`;
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const user = await admin.auth.admin.createUser({ email: stepEmail, email_confirm: true, app_metadata: { role: "tutor", org_id: org!.id } });
  const id = user.data.user!.id;
  try {
    await admin.from("tutors").insert({ id, display_name: "Nina Tutor" });
    const fam = await admin.from("tutor_families").insert({ tutor_id: id, parent_name: "P", parent_email: `p-${stepEmail}` }).select("id").single();
    const st = await admin
      .from("tutor_students")
      .insert({ tutor_id: id, family_id: fam.data!.id, first_name: "Alex", last_initial: "K", year_level: 12, subjects: ["Maths Methods"] })
      .select("id")
      .single();
    await admin.from("tutor_lessons").insert({ tutor_id: id, student_id: st.data!.id, starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(), duration_min: 60 });
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: stepEmail });
    await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
    await page.goto("/app");

    const steps = page.getByTestId("next-steps");
    await expect(steps.getByRole("heading", { name: "Before your next lesson" })).toBeVisible();
    await expect(steps).toContainText("Alex K.");
    await expect(steps).toContainText("No next step set.");

    await steps.getByRole("button", { name: "Set next step" }).click();
    await steps.getByLabel("Next step for Alex").fill("Try three chain-rule questions. Flag the first step that trips you up.");
    await steps.getByRole("button", { name: "Save" }).click();
    await expect(steps).toContainText("Try three chain-rule questions");
    await expect(steps).toContainText("Hasn't started");
    await expect(steps).toContainText("Start here: Do the first part together");

    await steps.getByRole("button", { name: "Update" }).click();
    await steps.getByText("Stuck", { exact: true }).click();
    await steps.getByLabel("Where they got stuck").fill("which part is the inner function in Q3");
    await steps.getByRole("button", { name: "Save" }).click();
    await expect(steps).toContainText("Stuck: which part is the inner function in Q3");
    await expect(steps).toContainText("Start here: Go over “which part is the inner function in Q3” together.");

    // It survives a reload, and only this tutor's task exists.
    await page.reload();
    await expect(page.getByTestId("next-steps")).toContainText("Stuck: which part is the inner function in Q3");
    const { data: rows } = await admin.from("tutor_tasks").select("status, note").eq("tutor_id", id);
    expect(rows).toEqual([{ status: "stuck", note: "which part is the inner function in Q3" }]);
  } finally {
    await admin.auth.admin.deleteUser(id);
  }
});
