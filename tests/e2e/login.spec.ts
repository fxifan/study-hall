/**
 * Phase 0 "done when": each seeded role logs in and lands on its home page, and can't open
 * another role's area. Logs in through /auth/confirm with a server-generated magic link token,
 * the same route an emailed link uses.
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { seedEmail, type SeedAccount } from "../../scripts/seed-data";

loadEnv();

async function logInAs(page: Page, account: SeedAccount) {
  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email: seedEmail(account),
  });
  if (error) throw new Error(`${error.message}. Run \`npm run db:seed\` first.`);
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
}

const homes: { account: SeedAccount; path: string; heading: RegExp; elsewhere: string }[] = [
  { account: "parentA", path: "/parent", heading: /your students/i, elsewhere: "/admin" },
  { account: "studentA", path: "/student", heading: /hi ava/i, elsewhere: "/parent" },
  { account: "proctor", path: "/proctor", heading: /today's sessions/i, elsewhere: "/student" },
  { account: "admin", path: "/admin", heading: /overview/i, elsewhere: "/proctor" },
];

for (const { account, path, heading, elsewhere } of homes) {
  test(`${account} logs in and lands on ${path}`, async ({ page }) => {
    await logInAs(page, account);
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);

    // Another role's area bounces back home.
    await page.goto(elsewhere);
    await expect(page).toHaveURL(path);

    // /login bounces a signed-in user home too.
    await page.goto("/login");
    await expect(page).toHaveURL(path);
  });
}

test("parent A's home lists only family A", async ({ page }) => {
  await logInAs(page, "parentA");
  const list = page.getByTestId("student-list");
  await expect(list).toContainText("Ava A.");
  await expect(list).toContainText("Leo A.");
  await expect(list).not.toContainText("Noah");
});

test("signed-out visitors are sent to /login", async ({ page }) => {
  for (const path of ["/parent", "/student", "/proctor", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/login");
  }
});

test("a used or bad link shows an error on /login", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=magiclink");
  await expect(page).toHaveURL("/login?error=link");
  // Filter: Next's route announcer is also role="alert".
  await expect(page.getByRole("alert").filter({ hasText: /expired or was already used/i })).toBeVisible();
});

test("a sign-in code that lands on another page is finished at /auth/confirm", async ({ page }) => {
  // What Supabase does when an email link's redirect isn't on its allow list: it uses the Site URL.
  await page.goto("/?code=00000000-0000-4000-8000-000000000000");
  await expect(page).toHaveURL("/login?error=link"); // forwarded, then refused: the code isn't real
});

test("logging out returns to /login and locks the role area", async ({ page }) => {
  await logInAs(page, "parentB");
  await expect(page).toHaveURL("/parent");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/parent");
  await expect(page).toHaveURL("/login");
});

test.describe("Simplified Chinese", () => {
  test("/zh/login is in Chinese", async ({ page }) => {
    await page.goto("/zh/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("button", { name: "发送登录链接" })).toBeVisible();
  });

  test.describe("a browser set to Chinese", () => {
    test.use({ locale: "zh-CN" });

    test("is sent to the Chinese pages", async ({ page }) => {
      await page.goto("/login");
      await expect(page).toHaveURL("/zh/login");
    });
  });

  test("a parent who chose Chinese logs in and stays in Chinese", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "zh", url: baseURL! }]);
    await logInAs(page, "parentA");
    await expect(page).toHaveURL("/zh/parent");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("您的孩子");
    await expect(page.getByTestId("student-list")).toContainText("11 年级 · 使用中");

    // Role routing keeps the language.
    await page.goto("/zh/admin");
    await expect(page).toHaveURL("/zh/parent");
  });

  test("the language switch changes language and is remembered", async ({ page }) => {
    await logInAs(page, "parentB");
    await expect(page).toHaveURL("/parent");

    await page.getByRole("link", { name: "中文" }).click();
    await expect(page).toHaveURL("/zh/parent");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("您的孩子");

    // Remembered: the English URL now sends this browser to Chinese.
    await page.goto("/parent");
    await expect(page).toHaveURL("/zh/parent");

    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL("/parent");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/your students/i);
  });
});
