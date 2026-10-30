/**
 * Sign-up up to payment (Phase 1B): a brand-new parent is sent to /onboarding, saves details, adds
 * and removes a child, agrees to the documents, and sees a per-student checkout summary. The Stripe
 * Checkout step itself is covered by stripe.spec.ts once a test key is configured.
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { seedEmail } from "../../scripts/seed-data";

loadEnv();
const admin = createAdminClient();
const stamp = Date.now();
const parentEmail = `onboarding-parent-${stamp}@studyhall.test`;
const childEmail = `onboarding-child-${stamp}@studyhall.test`;
const secondChildEmail = `onboarding-child2-${stamp}@studyhall.test`;
let parentId: string;

async function logIn(page: Page, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
}

test.beforeAll(async () => {
  // Same as a self sign-up: no app_metadata role, so the auth trigger makes a parent.
  const { data, error } = await admin.auth.admin.createUser({ email: parentEmail, email_confirm: true });
  if (error) throw error;
  parentId = data.user.id;
});

test.afterAll(async () => {
  const { data: links } = await admin.from("parent_students").select("student_id, students(profile_id)").eq("parent_id", parentId);
  for (const link of links ?? []) {
    await admin.from("students").delete().eq("id", link.student_id);
    const profileId = (link.students as unknown as { profile_id: string | null } | null)?.profile_id;
    if (profileId) await admin.auth.admin.deleteUser(profileId);
  }
  await admin.auth.admin.deleteUser(parentId);
});

test("a new parent signs up up to payment", async ({ page }) => {
  await logIn(page, parentEmail);
  await expect(page).toHaveURL("/onboarding");
  await expect(page.getByRole("heading", { name: "Before you pay" })).toBeVisible();
  await expect(page.getByText(/per student per week/)).toBeVisible();

  // 1. Details
  await page.getByLabel("Your name").fill("Pat Parent");
  await page.getByLabel(/How did you hear/).selectOption("wechat_referral");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Your name")).toHaveValue("Pat Parent");

  // 2. Children: add two, remove one
  const addChild = async (first: string, initial: string, year: string, email: string) => {
    await page.getByLabel("First name").fill(first);
    await page.getByLabel("Last initial").fill(initial);
    await page.getByLabel("Year level").selectOption(year);
    await page.getByLabel(/Your child's email/).fill(email);
    await page.getByRole("button", { name: "Add child" }).click();
  };
  await addChild("Mia", "t", "10", childEmail);
  const children = page.getByTestId("onboarding-children");
  await expect(children).toContainText("Mia T. · Year 10");
  await addChild("Sam", "T", "7", secondChildEmail);
  await expect(children).toContainText("Sam T. · Year 7");
  await children.locator("li", { hasText: "Sam T." }).getByRole("button", { name: "Remove" }).click();
  await expect(children).not.toContainText("Sam T.");

  // 3. Consent: nothing pre-ticked; both required
  const rules = page.getByLabel(/house rules, and my child agrees/);
  const privacy = page.getByLabel(/privacy & child safety notice, and I consent/);
  await expect(rules).not.toBeChecked();
  await expect(privacy).not.toBeChecked();
  await rules.check();
  await privacy.check();
  await page.getByRole("button", { name: "Agree" }).click();
  await expect(page.getByTestId("consent-done")).toContainText("house rules 2026-10-v1");

  // 4. Plans: per-student totals, supervision first, then tutoring
  const summaries = page.getByTestId("checkout-summary");
  await expect(summaries.nth(0)).toHaveText("1 × A$49 = A$49 per week");
  await expect(summaries.nth(1)).toHaveText("1 × A$149 = A$149 per week");
  await expect(page.locator("#pay")).toContainText("Includes one hour of tutoring per session attended, scheduled by the supervisor when you request it.");
  await expect(page.locator("#pay")).toContainText("Ask within 7 days of your first payment and we'll refund it.");
  await expect(page.locator("main")).not.toContainText("GST");
  await expect(page.locator("#pay")).toContainText("Questions before you pay? Email feifanwork1@gmail.com.");
  if (!process.env.STRIPE_SECRET_KEY) {
    await expect(page.getByText("Payments aren't switched on yet.").first()).toBeVisible();
  } else {
    // The tutoring plan needs subjects first, so the tutor can prepare.
    await page.getByRole("button", { name: "Continue to secure payment" }).nth(1).click();
    await expect(page.getByRole("alert").filter({ hasText: "at least one subject for each child" })).toBeVisible();
  }

  // Subjects: Year 10 sees both the junior and VCE lists
  const studies = page.getByRole("form", { name: "Subjects and current work: Mia" });
  await expect(studies.getByRole("group", { name: "Years 7–10" })).toBeVisible();
  const vce = studies.getByRole("group", { name: "VCE (Years 10–12)" });
  await vce.getByLabel("Mathematical Methods: Wants help").check(); // implies "takes"
  await vce.getByLabel("English: Takes").check();
  await studies.getByLabel(/Current work/).fill("Methods: functions revision.");
  await studies.getByRole("button", { name: "Save subjects" }).click();
  await expect(children.getByTestId("studies-summary")).toContainText("2 subjects");

  // What was stored
  const { data: profile } = await admin.from("profiles").select("full_name, acquisition_source, role").eq("id", parentId).single();
  expect(profile).toEqual({ full_name: "Pat Parent", acquisition_source: "wechat_referral", role: "parent" });
  // students reaches profiles twice (its login, and parents via parent_students): name the FK.
  const { data: students, error } = await admin
    .from("students")
    .select("first_name, last_initial, status, profiles!students_profile_id_fkey(role, email), consents(document, document_version, ip_hash)")
    .eq("first_name", "Mia")
    .eq("profile_id", (await admin.from("profiles").select("id").eq("email", childEmail).single()).data!.id);
  expect(error).toBeNull();
  expect(students).toHaveLength(1);
  const [mia] = students!;
  expect(mia.status).toBe("invited");
  expect(mia.profiles).toMatchObject({ role: "student", email: childEmail });
  expect(mia.consents.map((c) => c.document).sort()).toEqual(["house_rules", "privacy_child_safety"]);
  const { data: miaStudies } = await admin
    .from("students")
    .select("study_note, student_subjects(wants_help, subjects(code))")
    .eq("profile_id", (await admin.from("profiles").select("id").eq("email", childEmail).single()).data!.id)
    .single();
  expect(miaStudies?.study_note).toBe("Methods: functions revision.");
  expect(
    (miaStudies?.student_subjects as unknown as { wants_help: boolean; subjects: { code: string } }[])
      .map((s) => `${s.subjects.code}:${s.wants_help}`)
      .sort(),
  ).toEqual(["vce-english:false", "vce-methods:true"]);
  const removed = await admin.from("profiles").select("id").eq("email", secondChildEmail);
  expect(removed.data).toEqual([]);
});

test("onboarding is only for parents and signed-out visitors", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Create your parent account" })).toBeVisible();

  await logIn(page, seedEmail("studentA"));
  await page.goto("/onboarding");
  await expect(page).toHaveURL("/student");
});
