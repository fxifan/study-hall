/**
 * The spec's simulated session: one student present, one late with a phone flag, one absent. The
 * tutor works the help queue and approves reports; parents see them only once released; admins copy
 * the text, mark it sent and see metrics. Restores what it changes.
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { SEED_IDS, seedEmail, type SeedAccount } from "../../scripts/seed-data";

loadEnv();
const admin = createAdminClient();
let roomId: string;
let sessionId: string;

async function logIn(page: Page, account: SeedAccount) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: seedEmail(account) });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
}

test.beforeAll(async () => {
  const room = await admin
    .from("rooms")
    .insert({ org_id: SEED_IDS.org, name: "Simulated room", video_url: "https://example.com/simulated", capacity: 5 })
    .select("id")
    .single();
  if (room.error) throw room.error;
  roomId = room.data.id;
  const tutorId = (await admin.from("profiles").select("id").eq("email", seedEmail("tutor")).single()).data!.id;
  const at = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  // Ended ten minutes ago, so nothing auto-releases for another 50.
  const session = await admin.from("sessions").insert({ room_id: roomId, starts_at: at(-130), ends_at: at(-10), tutor_id: tutorId }).select("id").single();
  if (session.error) throw session.error;
  sessionId = session.data.id;
  await admin.from("enrolments").insert(
    [SEED_IDS.studentA, SEED_IDS.studentA2, SEED_IDS.studentB].map((student_id) => ({ session_id: sessionId, student_id })),
  );
  await admin.from("attendance").insert([
    { session_id: sessionId, student_id: SEED_IDS.studentA, check_in_at: at(-125), check_out_at: at(-11), status: "present" },
    { session_id: sessionId, student_id: SEED_IDS.studentB, check_in_at: at(-100), check_out_at: at(-11), status: "present" },
  ]);
  await admin.from("help_requests").insert([
    { session_id: sessionId, student_id: SEED_IDS.studentB, subject: "Physics", description: "Forces" },
    { session_id: sessionId, student_id: SEED_IDS.studentA, subject: "Methods", description: "Chain rule" },
  ]);
});

test.afterAll(async () => {
  if (!roomId) return;
  await admin.from("sessions").delete().eq("room_id", roomId);
  await admin.from("rooms").delete().eq("id", roomId);
});

test("the tutor runs the session, then approves reports", async ({ page }) => {
  await logIn(page, "tutor");
  await page.goto(`/proctor/session/${sessionId}`);

  // Tutoring student first, even though the other asked first.
  const queue = page.getByTestId("help-queue");
  await expect(queue).toContainText("one-to-one video");
  await expect(queue.locator("li").first()).toContainText("Ava A.");
  const ava = queue.locator("li", { hasText: "Chain rule" });
  await ava.getByRole("button", { name: "Take this" }).click();
  await expect(ava).toContainText("Being handled");
  await ava.getByLabel("Reply").fill("Try the outer function first.");
  await ava.getByRole("button", { name: "Send", exact: true }).click();
  await expect(ava).toContainText("You: Try the outer function first.");
  await ava.getByRole("button", { name: "Resolve" }).click();
  await expect(queue.locator("li", { hasText: "Chain rule" })).toContainText("Resolved");

  const noah = page.getByTestId(`controls-${SEED_IDS.studentB}`);
  await noah.getByRole("button", { name: "Late" }).click();
  await expect(noah.getByRole("button", { name: "Late" })).toHaveAttribute("aria-pressed", "true");
  await noah.getByRole("button", { name: /^Phone/ }).click();
  await expect(noah.getByRole("button", { name: "Phone 1" })).toBeVisible();

  const review = page.getByTestId("report-review");
  await expect(review).toContainText("Leo A.: confirm attendance first.");
  await page.getByTestId(`controls-${SEED_IDS.studentA2}`).getByRole("button", { name: "Absent" }).click();
  await expect(review.getByRole("form", { name: "Leo A." })).toBeVisible();

  const leo = review.getByRole("form", { name: "Leo A." });
  await leo.getByRole("button", { name: "Approve" }).click();
  await expect(leo).toContainText("Approved");
  const noahForm = review.getByRole("form", { name: "Noah B." });
  await noahForm.getByLabel(/Comment for Noah/).fill("Settled quickly after joining.");
  await noahForm.getByRole("button", { name: "Approve" }).click();
  await expect(noahForm).toContainText("Approved");
});

test("an unapproved report stays hidden; approved ones show flags and comments", async ({ page }) => {
  await logIn(page, "parentB");
  const card = page.getByTestId("report-list").locator("article", { hasText: "Settled quickly" });
  await expect(card).toContainText("Phone visible 1×");

  await logIn(page, "parentA");
  await expect(page.getByTestId("reports")).toContainText("Leo A. didn't attend this session");
  // Ava's report wasn't approved and the session ended under an hour ago.
  const ava = await admin.from("reports").select("id").eq("session_id", sessionId).eq("student_id", SEED_IDS.studentA);
  expect(ava.data).toEqual([]);
  await expect(page.getByTestId("reports").locator("article", { hasText: "Ava A." }).filter({ hasText: "Simulated" })).toHaveCount(0);
});

test("the student sees the supervisor's reply", async ({ page }) => {
  // The help list shows while in the room, so reopen attendance for this check.
  await admin.from("sessions").update({ ends_at: new Date(Date.now() + 30 * 60_000).toISOString() }).eq("id", sessionId);
  await admin.from("attendance").update({ check_out_at: null }).eq("session_id", sessionId).eq("student_id", SEED_IDS.studentA);
  await logIn(page, "studentA");
  await expect(page.getByTestId("help")).toContainText("Supervisor: Try the outer function first.");
  await admin.from("sessions").update({ ends_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("id", sessionId);
});

test("admins copy the report text, mark it sent and see metrics", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await logIn(page, "admin");
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Reports" }).click();
  const row = page.getByTestId("report-queue").locator("li", { hasText: "Noah B." }).first();
  await expect(row).toContainText(seedEmail("parentB"));
  await row.getByRole("button", { name: "Copy email text" }).click();
  await expect(row.getByRole("button", { name: "Copied" })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.indexOf("Session report: Noah B.")).toBeLessThan(text.indexOf("学习报告：Noah B."));
  expect(text).toContain("Phone visible 1×");
  await row.getByRole("button", { name: "Mark sent" }).click();
  await expect
    .poll(async () => (await admin.from("reports").select("status").eq("session_id", sessionId).eq("student_id", SEED_IDS.studentB).single()).data?.status)
    .toBe("sent");

  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Metrics" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Metrics");
  await expect(page.getByTestId("metric-stats")).toContainText("Paying families");
  await expect(page.getByTestId("metric-funnel")).toContainText("Sign-ups started");
  await expect(page.getByTestId("metric-weeks").locator("tbody tr").first()).toBeVisible();
});
