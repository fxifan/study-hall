/**
 * Breakout log on the proctor session page: the supervisor logs a Zoom breakout for the tutor, the
 * form won't start one with a single student, and ending it records the time. Uses a throwaway room
 * and a session that started 5 minutes ago, staffed by the seeded proctor and tutor.
 */
import { expect, test } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { SEED_IDS, seedEmail } from "../../scripts/seed-data";

loadEnv();
const admin = createAdminClient();
let roomId: string;
let sessionId: string;

async function profileId(account: "proctor" | "tutor") {
  const { data, error } = await admin.from("profiles").select("id").eq("email", seedEmail(account)).single();
  if (error) throw error;
  return data.id as string;
}

test.beforeAll(async () => {
  const room = await admin
    .from("rooms")
    .insert({ org_id: SEED_IDS.org, name: "E2E breakout room", video_url: "https://example.com/e2e-breakouts", capacity: 5 })
    .select("id")
    .single();
  if (room.error) throw room.error;
  roomId = room.data.id;

  const session = await admin
    .from("sessions")
    .insert({
      room_id: roomId,
      starts_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      ends_at: new Date(Date.now() + 235 * 60_000).toISOString(),
      proctor_id: await profileId("proctor"),
      tutor_id: await profileId("tutor"),
    })
    .select("id")
    .single();
  if (session.error) throw session.error;
  sessionId = session.data.id;
  const enrol = await admin.from("enrolments").insert([
    { session_id: sessionId, student_id: SEED_IDS.studentA },
    { session_id: sessionId, student_id: SEED_IDS.studentB },
  ]);
  if (enrol.error) throw enrol.error;
});

test.afterAll(async () => {
  if (roomId) {
    await admin.from("sessions").delete().eq("room_id", roomId); // cascades to the breakout log
    await admin.from("rooms").delete().eq("id", roomId);
  }
});

test("the supervisor logs a tutoring breakout, never one adult with one student", async ({ page }) => {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: seedEmail("proctor") });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
  await expect(page).toHaveURL("/proctor");
  await page.goto(`/proctor/session/${sessionId}`);

  const section = page.getByTestId("breakouts");
  await expect(section).toContainText("Never one adult alone with one student.");
  await expect(section).toContainText("No breakouts logged for this session yet.");
  await expect(section.getByLabel("Run by")).toHaveValue(await profileId("tutor"));
  const startButton = section.getByRole("button", { name: "Start breakout" });

  // One student and no second adult: the form won't start it.
  await section.getByLabel("Ava A.").check();
  await expect(section.getByText("Add a second student or a second adult.")).toBeVisible();
  await expect(startButton).toBeDisabled();

  await section.getByLabel("Noah B.").check();
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const list = section.getByTestId("breakout-list");
  await expect(list).toContainText("Ava A., Noah B.");
  await expect(list).toContainText("Run by Tom Tutor");
  await expect(list).toContainText("· open");
  await expect(section.getByLabel("Ava A.")).toBeDisabled(); // already in a breakout

  await list.getByRole("button", { name: "End breakout" }).click();
  await expect(list.getByRole("button", { name: "End breakout" })).toHaveCount(0);
  await expect(list).toContainText(/\d+ min/);
  await expect(section.getByLabel("Ava A.")).toBeEnabled();

  const { data: logged } = await admin.from("breakouts").select("ended_at, breakout_students(student_id)").eq("session_id", sessionId);
  expect(logged).toHaveLength(1);
  expect(logged![0].ended_at).not.toBeNull();
  expect(logged![0].breakout_students).toHaveLength(2);
});
