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
  await page.waitForURL(/\/student\/groups/);
}

async function student(firstName: string): Promise<{ email: string; id: string }> {
  const email = `social-${firstName.toLowerCase()}-${stamp}@studyhall.test`;
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "student", org_id: org!.id } });
  const id = data.user!.id;
  created.push(id);
  await admin.from("students").insert({ org_id: org!.id, profile_id: id, first_name: firstName, last_initial: "T", year_level: 10, status: "active", self_signed: true, social_enabled: true, birth_year: 2010, birth_month: 1 });
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

test("under-13s are sent to a parent; 13+ students can sign up", async ({ page }) => {
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
    await page.getByRole("button", { name: "Start my 7-day free trial" }).click();
  };
  const young = new Date().getFullYear() - 11;
  await fill(String(young), `social-young-${stamp}@studyhall.test`);
  await expect(page.getByText("You need a parent to set up Edumi for you.")).toBeVisible();
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
  await expect(page).toHaveURL(/\/student\/groups/);
  await expect(page.getByText(/Free trial: 7 days left/)).toBeVisible();
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
  await expect(a.getByText("Counting")).toBeVisible();
  await expect(b.getByText(/Alex T\. just started studying\. 6 hours left on today's goal\./)).toBeVisible({ timeout: 15_000 });
  await a.getByRole("button", { name: "Pause" }).click();
  await a.getByRole("button", { name: "Resume" }).click();
  const second = await a.context().newPage();
  await second.goto(groupUrl);
  await expect(second.getByRole("button", { name: "Stop" })).toBeVisible();
  await second.close();
  const starts = await admin.from("group_messages").select("id").eq("group_id", groupId).contains("meta", { event: "study_start" });
  expect(starts.data).toHaveLength(1);
  const live = await admin.from("study_sessions").select("id").eq("profile_id", alex.id).neq("state", "stopped");
  expect(live.data).toHaveLength(1);
  await a.getByRole("button", { name: "Stop" }).click();
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

  // Practice quiz, marked on the server: the key isn't on the page before submitting.
  await a.goto("/student/practice");
  await a.getByLabel("Topic").fill("Adding numbers");
  await a.getByRole("button", { name: "Make it" }).click();
  await expect(a.getByRole("button", { name: "Submit answers" })).toBeVisible({ timeout: 30_000 });
  expect(await a.content()).not.toContain("explanation");
  for (let i = 0; i < 8; i++) await a.getByRole("group", { name: `Question ${i + 1}` }).getByRole("radio").first().check();
  await a.getByRole("button", { name: "Submit answers" }).click();
  await expect(a.getByText("8 / 8 · 100%")).toBeVisible();
  await expect(a.getByText(/\+10 points \(completion\)/)).toBeVisible();
  const points = await admin.from("points_ledger").select("kind, points").eq("profile_id", alex.id);
  expect(points.data).toEqual([{ kind: "completion", points: 10 }]);
});
