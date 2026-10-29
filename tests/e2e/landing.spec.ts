/**
 * Landing page (docs/product-changes-plan.md, Phase 1A): the brief's positioning and sections,
 * honest labelling, working links, prices from the plans table, and both languages.
 */
import { expect, test, type Page } from "@playwright/test";

const BRIEF_QUESTIONS = [
  "Is Study Hall tutoring?",
  "How does online supervision work?",
  "Is webcam footage recorded?",
  "What happens if my child gets stuck?",
  "What will I receive after each session?",
  "Can my child join alongside existing tutoring?",
  "How do subscriptions, cancellations and refunds work?",
  "What happens if a session is cancelled or my child misses it?",
];

async function expectNoSidewaysScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

test("leads with the brief's positioning and primary actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make after-school study more consistent.");
  await expect(page.locator(".hero").getByRole("link", { name: /view plans/i })).toHaveAttribute("href", "#pricing");
  await expect(page.locator(".hero").getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "#how");
  for (const title of ["Set goals", "Study together", "Ask for help", "Review progress"]) {
    await expect(page.locator("#how").getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(page.locator("#tutoring")).toContainText("isn't a replacement for specialist tutoring");
});

test("every link goes somewhere real", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page.locator(".landing a[href]").evaluateAll((links) => [
    ...new Set(links.map((a) => a.getAttribute("href")!)),
  ]);
  expect(hrefs.length).toBeGreaterThan(5);
  for (const href of hrefs) {
    if (href.startsWith("#")) {
      await expect(page.locator(href), `anchor ${href}`).toHaveCount(1);
    } else if (href.startsWith("/")) {
      const res = await request.get(href);
      expect(res.status(), `link ${href}`).toBeLessThan(400);
    } else {
      expect(href, "only internal links and mailto").toMatch(/^mailto:/);
    }
  }
});

test("the sample report is labelled fictional and switches between examples", async ({ page }) => {
  await page.goto("/");
  const sample = page.locator("#report figure");
  await expect(sample).toContainText("Sample report · fictional student");
  await expect(sample).toContainText("Supervisor: Phone visible once during the session.");
  await expect(page.locator("#report")).toContainText("aren't a measure of learning or a guarantee of results");

  await page.getByRole("button", { name: "Didn't attend" }).click();
  await expect(sample).toContainText("Mia didn't attend today's session");
  await expect(page.getByRole("button", { name: "Didn't attend" })).toHaveAttribute("aria-pressed", "true");
});

test("pricing comes from the plans table and doesn't link to sign-up yet", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("plan-card").first();
  await expect(card).toContainText("A$");
  await expect(card).toContainText("49");
  await expect(card).toContainText("/ week");
  await expect(card.getByText("Sign-up opens soon")).toHaveAttribute("aria-disabled", "true");
});

test("the FAQ answers every question in the brief", async ({ page }) => {
  await page.goto("/");
  const faq = page.locator("#faq");
  for (const q of BRIEF_QUESTIONS) await expect(faq.getByText(q, { exact: true })).toBeVisible();

  await faq.getByText("Is webcam footage recorded?").click();
  await expect(faq).toContainText("doesn't record or store video, images or audio");
  await expect(faq).toContainText("under their own privacy terms");
});

test("the Chinese page is translated but keeps sample reports in English", async ({ page }) => {
  await page.goto("/zh");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("让课后学习更有规律。");
  await expect(page.locator("#report")).toContainText("报告目前以英文发送");
  await expect(page.locator("#report .ruled")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("plan-card").first()).toContainText("/ 周");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("has no sideways scrolling in either language", async ({ page }) => {
    await page.goto("/");
    await expectNoSidewaysScroll(page);
    await page.goto("/zh");
    await expectNoSidewaysScroll(page);
  });
});
