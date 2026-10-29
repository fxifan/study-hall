/**
 * Spec Phase 1 "done when" (student side): a student sets goals, joins via the external link, and
 * check-in shows up in the database. Also marking goals, "I'm stuck", Leave and history.
 * Uses a throwaway room and a session that started 5 minutes ago.
 */
import { expect, test } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { SEED_IDS, seedEmail } from "../../scripts/seed-data";

loadEnv();
const admin = createAdminClient();
const VIDEO_URL = `https://example.com/study-hall-e2e-room-${Date.now()}`;
let roomId: string;
let sessionId: string;

test.beforeAll(async () => {
  const room = await admin
    .from("rooms")
    .insert({ org_id: SEED_IDS.org, name: "E2E room", video_url: VIDEO_URL, capacity: 5 })
    .select("id")
    .single();
  if (room.error) throw room.error;
  roomId = room.data.id;

  // Keep Ava's "today" unambiguous: drop her other enrolments for sessions today.
  const dayStart = new Date(Date.now() - 12 * 3600_000).toISOString();
  const dayEnd = new Date(Date.now() + 12 * 3600_000).toISOString();
  const { data: today } = await admin.from("sessions").select("id").gte("starts_at", dayStart).lt("starts_at", dayEnd);
  if (today?.length) {
    await admin.from("enrolments").delete().eq("student_id", SEED_IDS.studentA).in("session_id", today.map((s) => s.id));
  }

  const session = await admin
    .from("sessions")
    .insert({
      room_id: roomId,
      starts_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      ends_at: new Date(Date.now() + 235 * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (session.error) throw session.error;
  sessionId = session.data.id;
  const enrol = await admin.from("enrolments").insert({ session_id: sessionId, student_id: SEED_IDS.studentA });
  if (enrol.error) throw enrol.error;
});

test.afterAll(async () => {
  if (roomId) {
    await admin.from("sessions").delete().eq("room_id", roomId);
    await admin.from("rooms").delete().eq("id", roomId);
  }
});

test("a student sets goals, joins, asks for help, marks goals and leaves", async ({ page, context }) => {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: seedEmail("studentA") });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
  await expect(page).toHaveURL("/student");

  const today = page.getByTestId("today");
  await expect(today).toContainText("E2E room");
  await expect(page.getByRole("timer")).toContainText(/Study block 1 of 4/);
  await expect(today).toContainText("Set at least one goal first.");

  // Goals, then Join (new tab -> the external video link)
  await page.getByLabel("Goal 1").fill("Methods: Exercise 4B");
  await page.getByLabel("Goal 2").fill("Chemistry: equilibrium notes");
  await page.getByRole("button", { name: "Save goals" }).click();
  const join = page.getByRole("link", { name: "Join session" });
  await expect(join).toHaveAttribute("target", "_blank");
  // Don't load the external page in the test; check where the check-in route sends us instead.
  await context.route(`${VIDEO_URL}**`, (route) => route.fulfill({ status: 200, body: "video room" }));
  const [popup] = await Promise.all([context.waitForEvent("page"), join.click()]);
  await popup.waitForURL(VIDEO_URL);
  await popup.close();

  const attendance = await admin
    .from("attendance")
    .select("status, check_in_at, check_out_at")
    .eq("session_id", sessionId)
    .eq("student_id", SEED_IDS.studentA)
    .single();
  expect(attendance.data?.status).toBe("present");
  expect(attendance.data?.check_in_at).not.toBeNull();

  await page.reload();
  await expect(today).toContainText("You joined at");

  // I'm stuck
  const help = page.getByTestId("help");
  await expect(help).toContainText("It isn't a private lesson");
  await help.getByLabel("Subject").fill("Methods");
  await help.getByLabel("What are you stuck on?").fill("Question 7, the chain rule part");
  await help.getByRole("button", { name: "Send help request" }).click();
  await expect(help).toContainText("Waiting");

  // Mark goals
  await page.getByRole("group", { name: "Methods: Exercise 4B" }).getByLabel("Done", { exact: true }).check();
  await page.getByRole("group", { name: "Chemistry: equilibrium notes" }).getByLabel("Partial").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await admin.from("goals").select("position, outcome").eq("session_id", sessionId).order("position")).data)
    .toEqual([
      { position: 1, outcome: "done" },
      { position: 2, outcome: "partial" },
    ]);
  await page.reload();
  await expect(page.getByRole("group", { name: "Methods: Exercise 4B" }).getByLabel("Done", { exact: true })).toBeChecked();

  // Leave
  await page.getByRole("button", { name: "Leave" }).click();
  await expect(today).toContainText("You left at");
  const left = await admin.from("attendance").select("check_out_at").eq("session_id", sessionId).single();
  expect(left.data?.check_out_at).not.toBeNull();

  await page.getByRole("link", { name: "Past sessions" }).click();
  await expect(page).toHaveURL("/student/history");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Past sessions");
});
