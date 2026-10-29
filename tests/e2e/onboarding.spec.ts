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
  await expect(page.getByText("Before you pay")).toBeVisible();
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
  await addChild("Sam", "T", "12", secondChildEmail);
  await expect(children).toContainText("Sam T. · Year 12");
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

  // 4. Plan: per-student total
  await expect(page.getByTestId("checkout-summary")).toHaveText("1 × A$49 = A$49 per week");
  if (!process.env.STRIPE_SECRET_KEY) await expect(page.getByText("Payments aren't switched on yet.")).toBeVisible();

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
