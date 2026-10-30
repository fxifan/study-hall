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
  "Who are the supervisors?",
  "How do I contact Study Hall?",
];

const CONTACT = "feifanwork1@gmail.com";
// Internal notes that must never reach a public page (owner brief §4, "Public content cleanup").
const INTERNAL_NOTE = /owner to (confirm|add)|待负责人确认|\bTODO\b|\bTBC\b/i;

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
  for (const title of ["Set goals", "Study with supervision", "Request academic help", "Review progress"]) {
    await expect(page.locator("#how").getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(page.locator("#tutoring")).toContainText("Neither plan replaces specialist tutoring or teaching");
});

test("no internal notes on public pages, and the contact email is shown", async ({ page }) => {
  for (const path of ["/", "/zh", "/legal/privacy", "/legal/house-rules", "/onboarding", "/zh/onboarding", "/login"]) {
    await page.goto(path);
    await expect(page.locator("body"), path).not.toContainText(INTERNAL_NOTE);
    await expect(page.locator("[data-owner-note], mark"), path).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.locator("#safety")).toContainText(CONTACT);
  await expect(page.locator("footer")).toContainText(CONTACT);
  await expect(page.locator(`a[href="mailto:${CONTACT}"]`).first()).toBeVisible();
  await page.goto("/legal/privacy");
  await expect(page.locator("article")).toContainText(CONTACT);
});

test("academic help scope and supervisor background are published", async ({ page }) => {
  await page.goto("/");
  const scope = page.locator("#tutoring .scope");
  for (const subject of ["Mathematical Methods", "General Mathematics", "Chemistry", "Biology", "Accounting", "Mathematics", "English", "Science", "Business and Commerce"]) {
    await expect(scope.getByText(subject, { exact: true })).toBeVisible();
  }
  await expect(scope).toContainText("depends on the supervisor rostered for each session");
  await expect(page.locator("#safety")).toContainText("medical students with years of tutoring and teaching experience");
  await expect(page.locator("body")).not.toContainText(/University of Melbourne/);
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
  await expect(sample).toContainText("Supervisor observation: Phone visible once during the session.");
  await expect(page.locator("#report")).toContainText("aren't a measure of learning or a guarantee of results");

  await page.getByRole("button", { name: "Didn't attend" }).click();
  await expect(sample).toContainText("Alex didn't attend this session (4:00–8:00pm).");
  await expect(page.getByRole("button", { name: "Didn't attend" })).toHaveAttribute("aria-pressed", "true");
});

test("pricing comes from the plans table and links to sign-up", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("plan-card").first();
  await expect(card).toContainText("A$");
  await expect(card).toContainText("49");
  await expect(card).toContainText("/ week");
  await expect(card).toContainText("per student");
  await expect(card.getByRole("link", { name: /Start/ })).toHaveAttribute("href", "/onboarding");
  await expect(card).toContainText("Supervised Study");
  await expect(card).toContainText(/Tutoring\s*\.*\s*Not included/);
  await expect(card).toContainText("Years 7–12");
  // The tutoring limit sits beside the A$149 price and its button.
  const tutoring = page.getByTestId("plan-card").nth(1);
  await expect(tutoring).toContainText("Study + Tutoring");
  await expect(tutoring).toContainText("149");
  await expect(tutoring).toContainText(
    "Includes one hour of tutoring per session attended, scheduled by the supervisor when you request it. The rest of the session is supervised independent study.",
  );

  const pricing = page.locator("#pricing");
  await expect(pricing).toContainText("keep access until the end of your paid week");
  await expect(pricing).toContainText("Ask within 7 days of your first payment and we'll refund it. Refunds aren't available after that.");
  // Study Hall isn't registered for GST, so prices don't mention it.
  await expect(page.locator("body")).not.toContainText("GST");
  const table = page.getByTestId("plan-comparison");
  await expect(table.locator("thead")).toContainText(/Supervised Study\s*A\$49/);
  await expect(table.locator("thead")).toContainText(/Study \+ Tutoring\s*A\$149/);
  await expect(table.getByRole("row", { name: /Scheduled tutoring/ })).toContainText(/Not included\s*One hour per session attended/);
});

test("the FAQ answers every question in the brief", async ({ page }) => {
  await page.goto("/");
  const faq = page.locator("#faq");
  for (const q of BRIEF_QUESTIONS) await expect(faq.getByText(q, { exact: true })).toBeVisible();

  await faq.getByText("Is webcam footage recorded?").click();
  await expect(faq).toContainText("doesn't record or store video, images or audio");
  await expect(faq).toContainText("under their own privacy terms");
  await faq.getByText("How do I contact Study Hall?").click();
  await expect(faq).toContainText(`Email ${CONTACT}`);
  await faq.getByText("What happens if a session is cancelled or my child misses it?").click();
  await expect(faq).toContainText("everyone booked into it gets a credit to attend another session instead");
  await faq.getByText("What happens if my child gets stuck?").click();
  await expect(faq).toContainText("VCE Mathematical Methods, General Mathematics, Chemistry, Biology, and Accounting");
});

test("the Chinese page is translated, sample report included", async ({ page }) => {
  await page.goto("/zh");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("让课后学习更有规律。");
  await expect(page.locator("#report")).toContainText("报告可以用英文或简体中文阅读");
  await expect(page.locator("#report figure")).toContainText("示例学习报告（虚构学生）");
  await expect(page.getByTestId("plan-card").first()).toContainText("/ 周");
  await expect(page.getByTestId("plan-card").nth(1)).toContainText("孩子每参加一节自习，包含一小时辅导");
  await expect(page.getByTestId("plan-comparison")).toContainText("每参加一节自习一小时");
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

test.describe("legal pages", () => {
  test("house rules are published with a version", async ({ page }) => {
    await page.goto("/legal/house-rules");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("House rules");
    await expect(page.getByText(/Version 2026-10-v1/)).toBeVisible();
    await expect(page.getByText("Phone face-down inside the camera frame for the whole block.")).toBeVisible();
    await expect(page.getByRole("note")).toHaveCount(0);
  });

  test("the privacy notice is clearly marked as a draft", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(page.getByRole("note")).toContainText("Draft");
    await expect(page.getByText(/Version 2026-10-draft-4/)).toBeVisible();
    await expect(page.locator("article")).toContainText("run by Feifan Wu, a sole trader");
  });

  test("Chinese pages say legal text is English only", async ({ page }) => {
    await page.goto("/zh/legal/privacy");
    await expect(page.getByText("法律文件目前仅提供英文版本。")).toBeVisible();
    await expect(page.locator("article")).toHaveAttribute("lang", "en");
  });
});
