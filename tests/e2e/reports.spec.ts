/**
 * Report cards in English and Simplified Chinese (comprehensive brief §5): the landing-page sample
 * and a parent's session reports switch language without a reload; labels and statuses change, what
 * people wrote doesn't; parents only see their own children's reports.
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { SEED_IDS, seedEmail, type SeedAccount } from "../../scripts/seed-data";

loadEnv();
const admin = createAdminClient();
let roomId: string;

async function logIn(page: Page, account: SeedAccount) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: seedEmail(account) });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
}

test.beforeAll(async () => {
  const room = await admin
    .from("rooms")
    .insert({ org_id: SEED_IDS.org, name: "Report test room", video_url: "https://example.com/report-room", capacity: 5 })
    .select("id")
    .single();
  if (room.error) throw room.error;
  roomId = room.data.id;

  // A finished four-hour session two days ago: Ava stayed 110 minutes and set three goals.
  const start = new Date(Date.now() - 2 * 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  const session = await admin.from("sessions").insert({ room_id: roomId, starts_at: at(0), ends_at: at(240) }).select("id").single();
  if (session.error) throw session.error;
  const sessionId = session.data.id;
  const student = SEED_IDS.studentA;
  for (const insert of [
    admin.from("enrolments").insert({ session_id: sessionId, student_id: student }),
    admin.from("attendance").insert({ session_id: sessionId, student_id: student, check_in_at: at(0), check_out_at: at(110), status: "left_early" }),
    admin.from("goals").insert([
      { session_id: sessionId, student_id: student, position: 1, text: "Methods: Exercise 4B", outcome: "done" },
      { session_id: sessionId, student_id: student, position: 2, text: "Chemistry: equilibrium notes", outcome: "partial" },
      { session_id: sessionId, student_id: student, position: 3, text: "English: essay plan", outcome: null },
    ]),
    admin.from("reports").insert({ session_id: sessionId, student_id: student, body_text: "(test)", proctor_comment: "Worked steadily on Methods.", status: "approved" }),
  ]) {
    const { error } = await insert;
    if (error) throw error;
  }
});

test.afterAll(async () => {
  if (!roomId) return;
  await admin.from("sessions").delete().eq("room_id", roomId); // cascades to the rest
  await admin.from("rooms").delete().eq("id", roomId);
});

test("a parent reads a session report in either language", async ({ page }) => {
  await logIn(page, "parentA");
  await expect(page).toHaveURL("/parent");
  const card = page.getByTestId("report-list").locator("article", { hasText: "Methods: Exercise 4B" });
  await expect(card).toContainText("Ava A.");
  await expect(card).toContainText("(110 minutes of a 240-minute session)");
  await expect(card).toContainText(/Methods: Exercise 4B\s*Done/);
  await expect(card).toContainText(/Chemistry: equilibrium notes\s*Partially completed/);
  await expect(card).toContainText(/English: essay plan\s*Not marked/);
  await expect(card).toContainText(/Supervisor comment\s*Worked steadily on Methods\./);

  // Switch without a reload: labels change, the student's and supervisor's words don't.
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  await page.getByRole("button", { name: "简体中文" }).click();
  await expect(card).toHaveAttribute("lang", "zh-CN");
  await expect(card).toContainText("出勤时间");
  await expect(card).toContainText("（240 分钟的学习时段中出勤 110 分钟）");
  await expect(card).toContainText(/Methods: Exercise 4B\s*已完成/);
  await expect(card).toContainText(/Chemistry: equilibrium notes\s*部分完成/);
  await expect(card).toContainText(/监督老师评语\s*Worked steadily on Methods\./);
  await expect(page.getByTestId("reports")).toContainText("按原文显示");
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
});

test("another family doesn't see the report", async ({ page }) => {
  await logIn(page, "parentB");
  await expect(page).toHaveURL("/parent");
  await expect(page.getByTestId("reports")).not.toContainText("Methods: Exercise 4B");
  await expect(page.getByTestId("reports")).not.toContainText("Ava");
});

test("the landing sample switches language and stays labelled as fictional", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const sample = page.locator("#report figure");
  await expect(sample).toContainText("Sample report · fictional student");
  await expect(sample).toContainText("Alex");
  await expect(sample).toContainText(/Complete biology revision questions\s*·\s*Done/);
  await expect(sample).toContainText(/Review chemistry notes\s*·\s*Partially completed/);
  await expect(sample).toContainText(/Finish English essay plan\s*·\s*Not completed/);
  await expect(sample).toContainText("Supervisor observation: Phone visible once during the session.");
  await expect(sample).toContainText("110 minutes of a 240-minute session");

  await page.locator("#report").getByRole("button", { name: "简体中文" }).click();
  await expect(sample).toHaveAttribute("lang", "zh-CN");
  await expect(sample).toContainText("示例学习报告（虚构学生）");
  await expect(sample).toContainText("出勤时间：下午 4:00 至 5:50（240 分钟的学习时段中出勤 110 分钟）");
  await expect(sample).toContainText(/完成生物复习题\s*·\s*已完成/);
  await expect(sample).toContainText(/复习化学笔记\s*·\s*部分完成/);
  await expect(sample).toContainText(/完成英语作文提纲\s*·\s*未完成/);
  await expect(sample).toContainText("监督员观察记录：本次学习期间，学生曾有一次手机出现在视线范围内。");

  await sample.getByRole("button", { name: "复制文字" }).click();
  await expect(sample.getByRole("button", { name: "已复制" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split("\n")[0]).toBe("【示例学习报告，虚构学生】");
  expect(copied).toContain("  - 完成生物复习题 · 已完成");

  // The whole sample switched, its buttons included.
  await page.locator("#report").getByRole("button", { name: "未参加" }).click();
  await expect(sample).toContainText("Alex 没有参加本节自习（16:00–20:00）。");
});

test("the Chinese landing page shows the sample in Chinese first", async ({ page }) => {
  await page.goto("/zh");
  await expect(page.locator(".hero .sheet")).toContainText("示例学习报告（虚构学生）");
  await expect(page.locator(".hero .sheet")).toContainText("完成生物复习题");
  await expect(page.locator("#report figure")).toHaveAttribute("lang", "zh-CN");
  await page.locator("#report").getByRole("button", { name: "English" }).click();
  await expect(page.locator("#report figure")).toContainText("Complete biology revision questions");
});
