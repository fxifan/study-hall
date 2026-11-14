/**
 * Edumi home (/), Study Hall at /study_hall, and the redesigned /tutors page (website redesign brief).
 */
import { expect, test } from "@playwright/test";

test("the home page leads with friendly competition and routes to every product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Outstudy your friends. Win together.");
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: /Challenge your friends/ }).first()).toHaveAttribute("href", "/join");
  await expect(page.locator("#students")).toContainText("A$3.99/month");
  await expect(main.getByRole("link", { name: /Explore Study Hall/ }).first()).toHaveAttribute("href", "/study_hall");
  await expect(main.getByRole("link", { name: /See Edumi for Tutors/ })).toHaveAttribute("href", "/tutors");
  await expect(page.getByRole("link", { name: "Log in" }).first()).toBeVisible();
});

test("Study Hall lives at /study_hall, and old /#section links are forwarded", async ({ page }) => {
  await page.goto("/study_hall");
  await expect(page.locator("#pricing")).toBeAttached();
  await page.goto("/#pricing");
  await expect(page).toHaveURL(/\/study_hall#pricing$/);
  const res = await page.request.get("/study-hall", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers().location).toMatch(/\/study_hall$/);
});

test("the home page in Chinese keeps the student product in English", async ({ page }) => {
  await page.goto("/zh");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Outstudy your friends. Win together.");
  await expect(page.locator("main").getByRole("link", { name: /Challenge your friends/ }).first()).toHaveAttribute("href", "/zh/join");
  await expect(page.locator("main").getByRole("link", { name: "了解 Study Hall" }).first()).toHaveAttribute("href", "/zh/study_hall");
});

test("opening a /zh link once doesn't switch the site to Chinese; the language switch does", async ({ page }) => {
  await page.goto("/zh");
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-AU");

  // Choosing 中文 is remembered, and English undoes it.
  await page.goto("/login");
  await page.getByRole("link", { name: "中文" }).click();
  await expect(page).toHaveURL(/\/zh\/login$/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/zh\/login$/);
  await page.getByRole("link", { name: "English" }).click();
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("nothing is hidden or animated", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const hidden = await page.locator("[data-rv]").evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity !== "1").length);
    expect(hidden).toBe(0);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("all home content is visible", async ({ page }) => {
    await page.goto("/");
    const hidden = await page.locator("[data-rv]").evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity !== "1").length);
    expect(hidden).toBe(0);
  });
});

test("scrolling reveals every section on the home page", async ({ page }) => {
  await page.goto("/");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(80);
  }
  await expect.poll(() => page.locator("[data-rv]:not(.in)").count()).toBe(0);
});

test("the tutor page has the real demo video and the sign-up form", async ({ page }) => {
  await page.goto("/tutors");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Keep students moving between lessons.");
  await expect(page.getByText("Illustrative, with a fictional student.")).toBeVisible();
  await expect(page.getByText("Demo video coming soon")).toHaveCount(0);
  const video = page.locator("#demo video");
  await expect(video).toHaveAttribute("poster", "/media/edumi-for-tutors-demo-poster.jpg");
  const src = await video.locator("source").getAttribute("src");
  const media = await page.request.get(src!);
  expect(media.status()).toBe(200);
  // It plays (muted for the test).
  const played = await video.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 1500));
    const t = v.currentTime;
    v.pause();
    return t;
  });
  expect(played).toBeGreaterThan(0.5);
  await page.getByRole("link", { name: "See an example", exact: true }).click();
  await expect(page).toHaveURL(/#next-steps$/);
  await expect(page.getByRole("heading", { name: "One next step, from one lesson to the next." })).toBeVisible();
  await page.getByRole("link", { name: "Try it with one student" }).click();
  await expect(page.locator("#signup input[name=name]")).toBeVisible();
  await expect(page.locator("#signup").getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/tutors/terms");
  // One paid plan, selling the trial: no separate $0 plan.
  await expect(page.locator("#pricing").getByText("14 days free, then A$15 a month. Cancel any time.")).toBeAttached();
  await expect(page.locator("#pricing article")).toHaveCount(1);
});

for (const width of [375, 768, 1280]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/tutors", "/study_hall"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
}
