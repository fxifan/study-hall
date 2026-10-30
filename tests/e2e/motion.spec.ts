/**
 * Landing-page motion (comprehensive brief §8): content rises in as it scrolls into view, nothing on
 * screen is ever hidden, nothing shifts, and without JavaScript or with reduced motion nothing is
 * hidden or animated at all.
 */
import { expect, test, type Page } from "@playwright/test";

const opacityOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).opacity);

test("content below the fold rises in as it scrolls into view", async ({ page }) => {
  await page.goto("/");
  const faq = page.locator("#faq .faq");
  await expect(faq).toHaveClass(/\brv\b/);
  await expect(faq).not.toHaveClass(/\bin\b/);
  expect(await opacityOf(page, "#faq .faq")).toBe("0");

  await faq.scrollIntoViewIfNeeded();
  await expect(faq).toHaveClass(/\bin\b/);
  await expect.poll(() => opacityOf(page, "#faq .faq")).toBe("1");
});

test("nothing on screen at load is hidden, and grid items are staggered", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".rv").first()).toBeAttached();
  const hiddenOnScreen = await page.evaluate(
    () => [...document.querySelectorAll(".rv:not(.in)")].filter((el) => el.getBoundingClientRect().top < window.innerHeight).length,
  );
  expect(hiddenOnScreen).toBe(0);
  const stagger = await page.locator(".steps > li").evaluateAll((items) => items.map((el) => (el as HTMLElement).style.getPropertyValue("--rv")));
  expect(stagger).toEqual(["0", "1", "2", "3"]);
});

test("scrolling the whole page causes no layout shift", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const w = window as unknown as { cls: number };
    w.cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) w.cls += entry.value;
      }
    }).observe({ type: "layout-shift" });
  });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBeLessThan(0.01);
  // Everything has arrived by the end.
  expect(await page.locator(".rv:not(.in)").count()).toBe(0);
});

test("plan cards lift on hover", async ({ page }) => {
  await page.goto("/#pricing");
  const card = page.getByTestId("plan-card").first();
  await card.hover();
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).translate)).toBe("0px -2px");
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing is hidden or lifted", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await page.locator(".rv").count()).toBe(0);
    expect(await opacityOf(page, "#faq .faq")).toBe("1");
    await page.getByTestId("plan-card").first().hover();
    expect(await page.getByTestId("plan-card").first().evaluate((el) => getComputedStyle(el).translate)).toBe("none");
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("all content is visible", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator(".rv").count()).toBe(0);
    expect(await opacityOf(page, "#faq .faq")).toBe("1");
    expect(await opacityOf(page, ".steps > li")).toBe("1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
