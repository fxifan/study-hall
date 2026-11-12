/**
 * Tutor ↔ student links (docs/tutor-next-steps.md): the tutor creates an invite link, a student
 * whose trial has ended accepts it, sees the next step free, reports where they got stuck and
 * studies on the solo timer; the tutor sees the report; the link works once; the student unlinks.
 */
import { expect, test, type Browser } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";

loadEnv();
const admin = createAdminClient();
const stamp = Date.now();
const users: string[] = [];

async function signIn(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
  await page.waitForLoadState("networkidle");
  return page;
}

test.afterAll(async () => {
  for (const id of users) {
    await admin.from("students").delete().eq("profile_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

test("a tutor links a student, who reports progress for free", async ({ browser }) => {
  test.setTimeout(150_000);
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();

  // Tutor Nina with a student record for Alex, a lesson soon, and a next step.
  const tutorEmail = `e2e-link-tutor-${stamp}@studyhall.test`;
  const t = await admin.auth.admin.createUser({ email: tutorEmail, email_confirm: true, app_metadata: { role: "tutor", org_id: org!.id } });
  const tutorId = t.data.user!.id;
  users.push(tutorId);
  await admin.from("tutors").insert({ id: tutorId, display_name: "Nina Tutor" });
  const fam = await admin.from("tutor_families").insert({ tutor_id: tutorId, parent_name: "P", parent_email: `p-${tutorEmail}` }).select("id").single();
  const rec = await admin
    .from("tutor_students")
    .insert({ tutor_id: tutorId, family_id: fam.data!.id, first_name: "Alex", last_initial: "K", year_level: 12, subjects: ["Maths Methods"] })
    .select("id")
    .single();
  const recordId = rec.data!.id as string;
  await admin.from("tutor_lessons").insert({ tutor_id: tutorId, student_id: recordId, starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(), duration_min: 60 });
  await admin.from("tutor_tasks").insert({ tutor_id: tutorId, student_id: recordId, body: "Try three chain-rule questions. Flag the first step that trips you up." });

  // Student Alex, whose free trial has ended.
  const studentEmail = `e2e-link-student-${stamp}@studyhall.test`;
  const s = await admin.auth.admin.createUser({ email: studentEmail, email_confirm: true, app_metadata: { role: "student", org_id: org!.id } });
  const studentId = s.data.user!.id;
  users.push(studentId);
  await admin.from("students").insert({ org_id: org!.id, profile_id: studentId, first_name: "Alex", last_initial: "K", year_level: 12, birth_year: 2009, birth_month: 3, status: "active", self_signed: true, social_enabled: true });
  await admin.from("student_plans").insert({ profile_id: studentId, trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() });

  // The tutor creates the invite link on Alex's page.
  const tutor = await signIn(browser, tutorEmail);
  await tutor.goto(`/app/students/${recordId}`);
  const linkBox = tutor.getByTestId("student-link");
  await expect(linkBox).toContainText("Link Alex's Edumi account");
  await linkBox.getByRole("button", { name: "Create invite link" }).click();
  const url = await linkBox.getByLabel("Invite link").inputValue();
  expect(url).toMatch(/\/link\/[A-Za-z0-9_-]{32}$/);
  const path = new URL(url).pathname;

  // Signed out, the invite says what the tutor will see and offers sign-up or login.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(path);
  await expect(visitor.getByRole("heading", { name: "Nina Tutor invited you to Edumi" })).toBeVisible();
  await expect(visitor.getByText("Your study time, groups, chats, friends or practice.")).toBeVisible();
  await expect(visitor.getByRole("button", { name: "Create a free account" })).toBeVisible();

  // Alex accepts and lands on My tutor, free even though the trial has ended.
  const student = await signIn(browser, studentEmail);
  await student.goto(path);
  await student.getByRole("button", { name: "Accept and link" }).click();
  await expect(student).toHaveURL(/\/student\/tutor$/);
  const card = student.getByTestId("tutor-task");
  await expect(card).toContainText("From Nina Tutor");
  await expect(card).toContainText("Try three chain-rule questions");
  await card.getByText("Stuck", { exact: true }).click();
  await card.getByLabel("Where did you get stuck?").fill("which part is the inner function in Q3");
  await card.getByRole("button", { name: "Tell Nina" }).click();
  await expect(card.getByText("Saved. Your tutor will see this.")).toBeVisible();

  // The solo timer runs without a plan or a group.
  await student.getByRole("button", { name: "Start studying" }).click();
  await expect(student.getByRole("button", { name: "Pause" })).toBeVisible();
  const { data: live } = await admin.from("study_sessions").select("group_id, state").eq("profile_id", studentId).neq("state", "stopped");
  expect(live).toEqual([{ group_id: null, state: "running" }]);
  await student.getByRole("button", { name: "Finish" }).click();

  // Paid pages still send an expired student to their tutor page, not the plan page.
  await student.goto("/student/groups");
  await expect(student).toHaveURL(/\/student\/tutor$/);

  // The link works once.
  await student.goto(path);
  await expect(student.getByRole("heading", { name: "This invite has expired" })).toBeVisible();

  // Nina sees what Alex reported.
  await tutor.goto("/app");
  const steps = tutor.getByTestId("next-steps");
  await expect(steps).toContainText("Stuck: which part is the inner function in Q3");
  await expect(steps).toContainText("reported by Alex");
  await tutor.goto(`/app/students/${recordId}`);
  await expect(tutor.getByTestId("student-link")).toContainText("Linked since");

  // Alex unlinks; Nina's page offers a new invite.
  await student.goto("/student/tutor");
  student.once("dialog", (d) => d.accept());
  await student.getByRole("button", { name: "Unlink" }).click();
  await expect(student.getByText("No tutor linked yet")).toBeVisible();
  await tutor.reload();
  await expect(tutor.getByTestId("student-link")).toContainText("Link Alex's Edumi account");
});
