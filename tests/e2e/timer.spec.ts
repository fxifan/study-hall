/**
 * The study timer keeps counting across tabs (docs/ui-refresh-and-timer.md): hiding the page never
 * pauses it, time away from Edumi counts for up to 2 hours, a longer absence asks what to count,
 * pause leaves time out, and a session over 6 hours is confirmed at Finish.
 * The pure rules are unit-tested in src/lib/social/social.test.ts ("timer rules").
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";

loadEnv();
const admin = createAdminClient();
const email = `e2e-timer-${Date.now()}@studyhall.test`;
let id = "";

test.afterAll(async () => {
  if (!id) return;
  await admin.from("students").delete().eq("profile_id", id);
  await admin.auth.admin.deleteUser(id);
});

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** Pretend the session started `startedMin` ago and Edumi was last open `seenMin` ago. */
async function rewind(sessionId: string, startedMin: number, seenMin: number) {
  await admin.from("study_sessions").update({ started_at: ago(startedMin), last_beat_at: ago(seenMin) }).eq("id", sessionId);
  await admin.from("study_intervals").update({ started_at: ago(startedMin) }).eq("session_id", sessionId).is("ended_at", null);
}

async function clockSeconds(page: Page) {
  const text = (await page.getByLabel("Study timer").locator("p.font-mono").first().textContent()) ?? "";
  return text.split(":").map(Number).reduce((s, x) => s * 60 + x, 0);
}

test("the timer keeps counting across tabs and asks after a long absence", async ({ page }) => {
  test.setTimeout(120_000);
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const u = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "student", org_id: org!.id } });
  id = u.data.user!.id;
  await admin.from("students").insert({ org_id: org!.id, profile_id: id, first_name: "Tim", last_initial: "R", year_level: 11, birth_year: 2010, birth_month: 1, status: "active", self_signed: true, social_enabled: true });
  await admin.from("student_plans").insert({ profile_id: id });
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
  await page.waitForURL(/\/student\/home/);

  await page.goto("/student/solo");
  await page.getByLabel("My own task").fill("Read lecture 5 slides");
  await page.getByRole("button", { name: "Start studying" }).click();
  await expect(page.getByLabel("Study timer").getByText("Studying", { exact: true })).toBeVisible();
  await expect(page.getByTestId("keeps-running")).toContainText("keeps running when you switch tabs");
  const { data: session } = await admin.from("study_sessions").select("id").eq("profile_id", id).neq("state", "stopped").single();
  const sid = session!.id as string;

  // Hiding the tab doesn't pause anything.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));
  });
  await page.waitForTimeout(1500);
  const { data: hidden } = await admin.from("study_sessions").select("state").eq("id", sid).single();
  expect(hidden!.state).toBe("running");

  // 40 minutes on Canvas and YouTube, Edumi closed for 35 of them: all of it counts.
  await rewind(sid, 40, 35);
  await page.reload();
  await expect(page.getByLabel("Study timer").getByText("Studying", { exact: true })).toBeVisible();
  expect(await clockSeconds(page)).toBeGreaterThanOrEqual(40 * 60);
  await expect(page.getByTestId("welcome-back")).toHaveCount(0);

  // Edumi closed for 3 hours: the extra time is held back and the student is asked.
  await rewind(sid, 200, 180);
  await page.reload();
  const sheet = page.getByTestId("welcome-back");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("radio", { name: /Count until I left Edumi\s*20 min/ })).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByRole("radio", { name: /I studied the whole time\s*3 h 20 min/ })).toBeVisible();
  await sheet.getByRole("button", { name: "Keep going from now" }).click();
  await expect(page.getByLabel("Study timer").getByText("Studying", { exact: true })).toBeVisible();
  const { data: pieces } = await admin.from("study_intervals").select("started_at, ended_at").eq("session_id", sid).order("started_at");
  expect(pieces).toHaveLength(2);
  const kept = (Date.parse(pieces![0].ended_at as string) - Date.parse(pieces![0].started_at as string)) / 1000;
  expect(Math.abs(kept - 20 * 60)).toBeLessThan(5);
  expect(pieces![1].ended_at).toBeNull();

  // Pause leaves time out; repeat clicks don't double anything.
  await page.getByLabel("Study timer").getByRole("button", { name: "Pause" }).click();
  await expect(page.getByLabel("Study timer").getByText("Paused", { exact: true })).toBeVisible();
  const { data: open } = await admin.from("study_intervals").select("id").eq("session_id", sid).is("ended_at", null);
  expect(open).toEqual([]);
  await page.getByLabel("Study timer").getByRole("button", { name: "Resume" }).click();
  await expect(page.getByLabel("Study timer").getByText("Studying", { exact: true })).toBeVisible();

  // Over 6 hours at Finish: confirm it.
  await admin.from("study_intervals").update({ started_at: ago(7 * 60) }).eq("session_id", sid).is("ended_at", null);
  await page.reload();
  await page.getByLabel("Study timer").getByRole("button", { name: "Finish" }).click();
  const long = page.getByTestId("long-session");
  await expect(long).toContainText("Keep it all?");
  await long.getByRole("button", { name: /^Keep 7 h/ }).click();
  await expect.poll(async () => (await admin.from("study_sessions").select("state").eq("id", sid).single()).data!.state).toBe("stopped");
  const { data: done } = await admin.from("study_sessions").select("credited_seconds, stop_reason").eq("id", sid).single();
  expect(done!.stop_reason).toBe("manual");
  // 20 min kept from before the absence + about 7 h in the resumed piece.
  expect(Math.abs((done!.credited_seconds as number) - (20 * 60 + 7 * 3600))).toBeLessThan(120);
});
