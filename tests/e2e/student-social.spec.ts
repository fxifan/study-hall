/**
 * Edumi student social core (docs/student-social.md): the under-13 gate, 13+ self sign-up, a
 * group with an invite code, realtime chat, the verified timer (one start event per session),
 * Call Out for Help, an AI practice quiz marked on the server, and an outsider who can't read
 * the group. Run the dev server with TUTOR_RESOURCES_OFFLINE=1. Deletes the students it creates.
 */
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createAdminClient, loadEnv, requireEnv } from "../../scripts/lib/env";

loadEnv();
const admin = createAdminClient();
const stamp = Date.now();
const created: string[] = [];

async function magic(page: Page, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
  // The link redirects to /student, which sends self-signed students on to /student/groups.
  await page.waitForURL(/\/student\/home/);
}

async function student(firstName: string): Promise<{ email: string; id: string }> {
  const email = `social-${firstName.toLowerCase()}-${stamp}@studyhall.test`;
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "student", org_id: org!.id } });
  const id = data.user!.id;
  created.push(id);
  await admin.from("students").insert({ org_id: org!.id, profile_id: id, first_name: firstName, last_initial: "T", year_level: 10, status: "active", self_signed: true, social_enabled: true, birth_year: 2010, birth_month: 1 });
  // A trial that started before card-required trials, so the test has full access.
  await admin.from("student_plans").insert({ profile_id: id });
  return { email, id };
}

async function pageFor(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await magic(page, email);
  return page;
}

test.afterAll(async () => {
  if (created.length) await admin.from("study_groups").delete().in("created_by", created);
  for (const id of created) {
    await admin.from("students").delete().eq("profile_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

test("under-13s are pointed to Study Hall; 13+ students can sign up", async ({ page }) => {
  await page.goto("/join");
  await expect(page.getByText("Study with your friends")).toBeVisible();
  const fill = async (year: string, email: string) => {
    await page.getByLabel("First name").fill("Gate");
    await page.getByLabel("Last initial").fill("T");
    await page.getByLabel("Year level").selectOption("7");
    await page.getByLabel("Birth month").selectOption("12");
    await page.getByLabel("Birth year").selectOption(year);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create my account" }).click();
  };
  const young = new Date().getFullYear() - 11;
  await fill(String(young), `social-young-${stamp}@studyhall.test`);
  await expect(page.getByText("Edumi study groups are for students 13 and over.")).toBeVisible();
  await expect(page.getByRole("link", { name: "edumi.app/study_hall" })).toBeVisible();
  const { data: none } = await admin.from("profiles").select("id").eq("email", `social-young-${stamp}@studyhall.test`);
  expect(none).toHaveLength(0);

  await page.goto("/join");
  const email = `social-self-${stamp}@studyhall.test`;
  await fill(String(new Date().getFullYear() - 15), email);
  await expect(page.getByText(/for your login link/)).toBeVisible();
  const { data: p } = await admin.from("profiles").select("id, role").eq("email", email).single();
  created.push(p!.id);
  expect(p!.role).toBe("student");
  await magic(page, email);
  // The trial starts in Stripe Checkout with a card: first stop is the plan page.
  await expect(page).toHaveURL(/\/student\/plan/);
  await expect(page.getByTestId("start-trial")).toContainText("A$11.99 a month, charged to that card until you cancel");
  await expect(page.getByRole("button", { name: "Get Edumi free for 7 days" })).toBeVisible();
  await expect(page.getByText("7 days free, then A$11.99 a month. Cancel any time.")).toBeAttached();
});

test("a group studies together: chat, timer, help and practice", async ({ browser }) => {
  test.setTimeout(120_000);
  const alex = await student("Alex");
  const bea = await student("Bea");
  const out = await student("Outsider");

  const a = await pageFor(browser, alex.email);
  await a.goto("/student/groups");
  await a.getByLabel("Name").fill("Methods crew");
  await a.getByLabel("Daily goal (combined hours)").fill("6");
  await a.getByRole("button", { name: "Create group" }).click();
  await expect(a.getByRole("heading", { name: "Methods crew" })).toBeVisible();
  const groupUrl = a.url();
  const groupId = groupUrl.split("/").pop()!;
  const code = (await admin.from("study_group_invites").select("code").eq("group_id", groupId).single()).data!.code as string;

  // Bea joins with the invite code.
  const b = await pageFor(browser, bea.email);
  await b.goto(`/student/groups?code=${code}`);
  await b.getByRole("button", { name: "Join the group" }).click();
  await expect(b.getByRole("heading", { name: "Methods crew" })).toBeVisible();
  await expect(a.getByText("Bea T. joined the group.")).toBeVisible({ timeout: 15_000 });

  // Realtime chat.
  await b.getByLabel("Message").fill("Anyone doing chain rule tonight?");
  await b.getByRole("button", { name: "Send" }).click();
  await expect(a.getByText("Anyone doing chain rule tonight?")).toBeVisible({ timeout: 15_000 });

  // Timer: one start event, even after pause and resume or a second tab.
  await a.getByRole("button", { name: "Start studying" }).click();
  await expect(a.getByText("Studying", { exact: true })).toBeVisible();
  await expect(b.getByText(/Alex T\. just started studying\. 6 hours left on today's goal\./)).toBeVisible({ timeout: 15_000 });
  await a.getByRole("button", { name: "Pause" }).click();
  await a.getByRole("button", { name: "Resume" }).click();
  const second = await a.context().newPage();
  await second.goto(groupUrl);
  await expect(second.getByRole("button", { name: "Finish" })).toBeVisible();
  await second.close();
  const starts = await admin.from("group_messages").select("id").eq("group_id", groupId).contains("meta", { event: "study_start" });
  expect(starts.data).toHaveLength(1);
  const live = await admin.from("study_sessions").select("id").eq("profile_id", alex.id).neq("state", "stopped");
  expect(live.data).toHaveLength(1);
  await a.getByRole("button", { name: "Finish" }).click();
  await expect(a.getByRole("button", { name: "Start studying" })).toBeVisible();
  const stopped = await admin.from("study_sessions").select("state, credited_seconds").eq("profile_id", alex.id).single();
  expect(stopped.data!.state).toBe("stopped");

  // Call Out for Help: Bea asks Alex; Alex accepts; Bea marks it sorted.
  await b.reload();
  await b.getByLabel("Who to ask").selectOption({ label: "Ask Alex T." });
  await b.getByPlaceholder("What are you stuck on? (optional)").fill("Q4 on the SAC prep");
  await b.getByRole("button", { name: "Call out" }).click();
  await a.reload();
  await a.getByRole("button", { name: "I can help" }).click();
  await expect(a.getByText("Accepted by you")).toBeVisible();
  await b.reload();
  await b.getByRole("button", { name: "Sorted" }).click();
  await expect.poll(async () => (await admin.from("group_help_requests").select("state, accepted_by").eq("group_id", groupId).single()).data).toEqual({ state: "resolved", accepted_by: alex.id });

  // Outsiders can't open or read the group.
  const o = await pageFor(browser, out.email);
  await o.goto(groupUrl).catch(() => null);
  await expect(o.getByText(/could not be found|404/i).first()).toBeVisible();
  await expect(o.getByText("Anyone doing chain rule tonight?")).toHaveCount(0);
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: out.email });
  const client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false } });
  await client.auth.verifyOtp({ token_hash: link.properties!.hashed_token, type: "magiclink" });
  expect((await client.from("group_messages").select("id").eq("group_id", groupId)).data).toEqual([]);
  expect((await client.from("study_groups").select("id").eq("id", groupId)).data).toEqual([]);
  const sneaky = await client.from("group_messages").insert({ group_id: groupId, sender_id: out.id, kind: "text", body: "hi" });
  expect(sneaky.error).not.toBeNull();

  // A curriculum quiz: multiple choice and free response, marked on the server (offline marker:
  // full marks for an answer with "because"). Nothing from the key is on the page before submitting.
  await a.goto("/student/practice");
  await a.getByLabel("Subject and level").selectOption({ label: "Victorian Curriculum · Mathematics · Year 10" });
  await a.locator('input[name="point"]').first().check();
  await a.getByRole("button", { name: "Make my quiz" }).click();
  await expect(a.getByRole("button", { name: "Submit for marking" })).toBeVisible({ timeout: 30_000 });
  const html = await a.content();
  expect(html).not.toContain("Counting on two");
  expect(html).not.toContain("States the result is 4");
  for (let i = 0; i < 6; i++) await a.getByRole("group", { name: `Question ${i + 1}` }).getByRole("radio").first().check();
  await a.getByLabel("Your answer to question 7").fill("It is 4 because you count on two from two.");
  await a.getByLabel("Your answer to question 8").fill("four");
  await a.getByRole("button", { name: "Submit for marking" }).click();
  // 6 multiple choice (1 each) + 3 + 1 = 10 of 12.
  await expect(a.getByText("10 / 12 marks")).toBeVisible({ timeout: 30_000 });
  await expect(a.getByText("+10 points")).toBeVisible();
  const points = await admin.from("points_ledger").select("kind, points").eq("profile_id", alex.id).order("kind");
  // The quiz pays its marks, and finishing it makes today a study day (+5).
  expect(points.data).toEqual([{ kind: "marks", points: 10 }, { kind: "study_day", points: 5 }]);
  // A retake that doesn't beat 10 pays nothing.
  await a.getByRole("button", { name: "Try again" }).click();
  for (let i = 0; i < 6; i++) await a.getByRole("group", { name: `Question ${i + 1}` }).getByRole("radio").first().check();
  await a.getByLabel("Your answer to question 7").fill("4");
  await a.getByLabel("Your answer to question 8").fill("4");
  await a.getByRole("button", { name: "Submit for marking" }).click();
  await expect(a.getByText("8 / 12 marks")).toBeVisible({ timeout: 30_000 });
  await expect(a.getByText(/No new points/)).toBeVisible();
});

test("a uni student born before 2005 can sign up", async ({ page }) => {
  const email = `social-uni-${stamp}@studyhall.test`;
  await page.goto("/join");
  await page.getByLabel("First name").fill("Uni");
  await page.getByLabel("Last initial").fill("T");
  await page.getByLabel("Year level").selectOption({ label: "University or TAFE" });
  await page.getByLabel("Birth month").selectOption("3");
  await page.getByLabel("Birth year").selectOption("1998");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByText(/for your login link/)).toBeVisible();
  const { data: p } = await admin.from("profiles").select("id").eq("email", email).single();
  created.push(p!.id);
  const { data: s } = await admin.from("students").select("year_level, birth_year").eq("profile_id", p!.id).single();
  expect(s).toEqual({ year_level: 13, birth_year: 1998 });
});
