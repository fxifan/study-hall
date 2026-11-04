/**
 * Tutor Solo plan (A$15/month, owner decision 4 Nov 2026): a tutor whose trial has ended pays in
 * Stripe TEST mode from Settings and is on Solo straight away. Localhost only, with a test key.
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

test("a tutor upgrades to Solo with Stripe Checkout", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `tutor-pay-${Date.now()}@studyhall.test`;
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const { data: user, error } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "tutor", org_id: org!.id } });
  if (error) throw error;
  const id = user.user.id;
  let customer: string | null = null;
  try {
    await admin.from("tutors").insert({ id, display_name: "Paying Tutor", trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() });
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    await page.goto(`/auth/confirm?token_hash=${link!.properties!.hashed_token}&type=magiclink`);
    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Upgrade to Solo, A$15.00/month" }).click();

    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    const cardLabel = page.locator("#payment-method-label-card");
    await cardLabel.waitFor();
    const box = (await cardLabel.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.locator("#cardNumber").fill("4242424242424242");
    await page.locator("#cardExpiry").fill("12 / 34");
    await page.locator("#cardCvc").fill("123");
    await page.locator("#billingName").fill("Paying Tutor");
    const country = page.locator("#billingCountry");
    if (await country.isVisible().catch(() => false)) await country.selectOption("AU");
    const postcode = page.locator("#billingPostalCode");
    if (await postcode.isVisible().catch(() => false)) await postcode.fill("3000");
    const saveToLink = page.locator("#enableStripePass");
    if (await saveToLink.isChecked().catch(() => false)) await saveToLink.uncheck();
    await page.locator('[data-testid="hosted-payment-submit-button"]').click();

    await page.waitForURL(/\/app\/settings\?checkout=/, { timeout: 90_000 });
    await expect(page.getByText("you're on Solo")).toBeVisible();
    await expect(page.getByRole("button", { name: /Manage billing/ })).toBeVisible();
    const row = (await admin.from("tutors").select("plan, stripe_customer_id").eq("id", id).single()).data;
    expect(row?.plan).toBe("solo");
    customer = row!.stripe_customer_id;
    expect(customer).toMatch(/^cus_/);
  } finally {
    if (customer) await stripe.customers.del(customer).catch(() => undefined);
    await admin.auth.admin.deleteUser(id);
  }
});
