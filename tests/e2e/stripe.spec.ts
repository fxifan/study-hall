/**
 * Spec Phase 1 "done when": a test parent pays in Stripe TEST mode. Runs against the local dev app
 * only (Stripe's hosted Checkout with the published test card 4242…). Then cancels through the
 * Stripe API and waits for the webhook (registered on the production URL, which shares this
 * database) to cancel the child's access. Skipped without a test key. Cleans up after itself.
 */
import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";

loadEnv();
const key = process.env.STRIPE_SECRET_KEY ?? "";
test.skip(!key.startsWith("sk_test_"), "needs a Stripe TEST secret key");
test.skip(({ baseURL }) => !/^http:\/\/localhost(:\d+)?$/.test(baseURL ?? ""), "test payments run against localhost only");

const admin = createAdminClient();
const stripe = new Stripe(key || "sk_test_unused");
const stamp = Date.now();
const parentEmail = `stripe-parent-${stamp}@studyhall.test`;
const childEmail = `stripe-child-${stamp}@studyhall.test`;
let parentId: string;
let customerId: string | null = null;

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email: parentEmail, email_confirm: true });
  if (error) throw error;
  parentId = data.user.id;
});

test.afterAll(async () => {
  if (customerId) await stripe.customers.del(customerId).catch(() => undefined);
  const { data: links } = await admin.from("parent_students").select("student_id, students(profile_id)").eq("parent_id", parentId);
  await admin.from("subscriptions").delete().eq("parent_id", parentId);
  for (const link of links ?? []) {
    await admin.from("students").delete().eq("id", link.student_id);
    const profileId = (link.students as unknown as { profile_id: string | null } | null)?.profile_id;
    if (profileId) await admin.auth.admin.deleteUser(profileId);
  }
  await admin.auth.admin.deleteUser(parentId);
});

test("a parent pays in Stripe test mode, and cancelling removes access", async ({ page }) => {
  test.setTimeout(180_000);
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: parentEmail });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`);
  await expect(page).toHaveURL("/onboarding");

  await page.getByLabel("Your name").fill("Stripe Test Parent");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByLabel("First name").fill("Casey");
  await page.getByLabel("Last initial").fill("S");
  await page.getByLabel(/Your child's email/).fill(childEmail);
  await page.getByRole("button", { name: "Add child" }).click();
  await expect(page.getByTestId("onboarding-children")).toContainText("Casey S.");
  await page.getByLabel(/house rules, and my child agrees/).check();
  await page.getByLabel(/privacy & child safety notice, and I consent/).check();
  await page.getByRole("button", { name: "Agree" }).click();
  await expect(page.getByTestId("consent-done")).toBeVisible();
  await expect(page.getByTestId("checkout-summary").first()).toHaveText("1 × A$49 = A$49 per week");

  // Stripe's hosted Checkout, test mode. The first plan is Supervised Study (A$49).
  await page.getByRole("button", { name: "Continue to secure payment" }).first().click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  // Choose "Card" (Klarna is also offered). Its accordion button sits under a cover, so click the label.
  const cardLabel = page.locator("#payment-method-label-card");
  await cardLabel.waitFor();
  const box = (await cardLabel.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator("#cardNumber").fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("Stripe Test Parent");
  const country = page.locator("#billingCountry");
  if (await country.isVisible().catch(() => false)) await country.selectOption("AU");
  const postcode = page.locator("#billingPostalCode");
  if (await postcode.isVisible().catch(() => false)) await postcode.fill("3000");
  // Don't save details to Stripe Link (it would also ask for a phone number).
  const saveToLink = page.locator("#enableStripePass");
  if (await saveToLink.isChecked().catch(() => false)) await saveToLink.uncheck();
  await page.locator('[data-testid="hosted-payment-submit-button"]').click();

  // Back on Study Hall: payment confirmed, child active and enrolled
  await page.waitForURL(/\/parent\?welcome=1/, { timeout: 90_000 });
  await expect(page.getByRole("status")).toContainText("Payment received");
  await expect(page.getByTestId("billing")).toContainText("Supervised Study · 1 × A$49 per week · renews");

  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_customer_id, status, quantity")
    .eq("parent_id", parentId)
    .single();
  expect(sub?.status).toBe("active");
  expect(sub?.quantity).toBe(1);
  expect(sub?.stripe_subscription_id).toMatch(/^sub_/);
  customerId = sub!.stripe_customer_id;

  const { data: child } = await admin
    .from("students")
    .select("id, status, enrolments(count)")
    .eq("first_name", "Casey")
    .eq("profile_id", (await admin.from("profiles").select("id").eq("email", childEmail).single()).data!.id)
    .single();
  expect(child?.status).toBe("active");
  expect((child?.enrolments as unknown as { count: number }[])[0].count).toBeGreaterThan(0);

  // Cancel in Stripe; the production webhook should turn access off.
  await stripe.subscriptions.cancel(sub!.stripe_subscription_id!);
  await expect
    .poll(async () => (await admin.from("students").select("status").eq("id", child!.id).single()).data?.status, {
      timeout: 60_000,
      intervals: [2_000],
    })
    .toBe("cancelled");
});
