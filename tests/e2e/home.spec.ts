/**
 * Edumi home (/), Study Hall at /study_hall, and the redesigned /tutors page (website redesign brief).
 */
import { expect, test } from "@playwright/test";

test("the home page leads with studying with friends and routes to every product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Study together. Every minute counts.");
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: /Start your free week/ }).first()).toHaveAttribute("href", "/join");
  await expect(page.locator("#students")).toContainText("A$11.99/month");
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

test("the home page in Chinese", async ({ page }) => {
  await page.goto("/zh");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("一起学习，每分钟都算数。");
  await expect(page.locator("main").getByRole("link", { name: /免费试用一周/ }).first()).toHaveAttribute("href", "/zh/join");
  await expect(page.locator("main").getByRole("link", { name: "了解 Study Hall" }).first()).toHaveAttribute("href", "/zh/study_hall");
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
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Parent updates in 60 seconds");
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
  await page.getByRole("link", { name: "Watch the demo", exact: true }).click();
  await expect(page).toHaveURL(/#demo$/);
  await page.getByRole("link", { name: "Start your 14-day free trial" }).click();
  await expect(page.locator("#signup input[name=name]")).toBeVisible();
  await expect(page.locator("#signup").getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/tutors/terms");
  await expect(page.getByText("A$15")).toHaveCount(2);
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
