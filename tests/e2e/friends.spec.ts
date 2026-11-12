/**
 * Friends by username, direct messages and group invites (docs/friends.md): pick a username, add a
 * friend by exact username, accept, message live, invite them to a group and join, report, block;
 * an adult and an under-18 with no shared group can't find each other.
 */
import { expect, test, type Browser } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";

loadEnv();
const admin = createAdminClient();
const n = Date.now() % 100_000_000;
const created: string[] = [];
let groupId = "";

async function student(name: string, opts: { username?: string; birthYear?: number } = {}) {
  const email = `friends-${name.toLowerCase()}-${n}@studyhall.test`;
  const { data: org } = await admin.from("orgs").select("id").limit(1).single();
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "student", org_id: org!.id } });
  const id = data.user!.id;
  created.push(id);
  await admin.from("students").insert({
    org_id: org!.id,
    profile_id: id,
    first_name: name,
    last_initial: "T",
    year_level: opts.birthYear && opts.birthYear < 2008 ? 13 : 10,
    birth_year: opts.birthYear ?? 2010,
    birth_month: 1,
    status: "active",
    self_signed: true,
    social_enabled: true,
    username: opts.username ?? null,
  });
  // A trial that started before card-required trials, so the test has full access.
  await admin.from("student_plans").insert({ profile_id: id });
  return { id, email, orgId: org!.id as string };
}

async function login(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
  await page.waitForURL(/\/student\/home/);
  return page;
}

test.afterAll(async () => {
  if (groupId) {
    await admin.from("study_group_members").delete().eq("group_id", groupId);
    await admin.from("study_groups").delete().eq("id", groupId);
  }
  for (const id of created) {
    await admin.from("students").delete().eq("profile_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

test("add by username, message, invite to a group, report and block", async ({ browser }) => {
  test.setTimeout(180_000);
  const mia = await student("Mia");
  const leo = await student("Leo", { username: `leo${n}` });
  await student("Zed", { username: `zed${n}`, birthYear: 2000 }); // an adult, no shared group
  const { data: g } = await admin.from("study_groups").insert({ org_id: mia.orgId, name: "Chem grind", created_by: mia.id }).select("id").single();
  groupId = g!.id as string;
  await admin.from("study_group_members").insert({ group_id: groupId, profile_id: mia.id, role: "owner" });

  // Mia picks a username the first time she opens Friends.
  const page = await login(browser, mia.email);
  await page.goto("/student/friends");
  await page.getByRole("textbox", { name: "Username", exact: true }).fill(`@Mia${n}`);
  await page.getByRole("button", { name: "Save username" }).click();
  await expect(page.getByText(`You're @mia${n}`)).toBeVisible();

  // The adult with no shared group looks like nobody.
  await page.getByRole("textbox", { name: "Their username" }).fill(`zed${n}`);
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText(`No one with the username @zed${n}`)).toBeVisible();

  // Add Leo by exact username.
  await page.getByRole("textbox", { name: "Their username" }).fill(`@leo${n}`);
  await page.getByRole("button", { name: "Find" }).click();
  const result = page.getByTestId("lookup-result");
  await expect(result).toContainText("Leo T.");
  await result.getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("lookup-result")).toContainText("Request sent");

  // Leo sees the dot and the request, and accepts.
  const leoPage = await login(browser, leo.email);
  await expect(leoPage.getByRole("img", { name: "New" }).first()).toBeAttached();
  await leoPage.goto("/student/friends");
  await expect(leoPage.getByText(`@mia${n} · wants to be friends`)).toBeVisible();
  await leoPage.getByRole("button", { name: "Accept" }).click();
  await leoPage.getByRole("link", { name: /Mia T\./ }).click();
  await expect(leoPage).toHaveURL(new RegExp(`/student/messages/${mia.id}`));

  // Mia messages Leo; it arrives live on Leo's open conversation.
  await page.goto(`/student/messages/${leo.id}`);
  await page.getByLabel("Message Leo").fill("chem tonight?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(leoPage.getByText("chem tonight?")).toBeVisible({ timeout: 25_000 });

  // Mia invites Leo into her group; Leo joins from the card.
  await page.getByText("Options ⋯").click();
  await page.getByLabel("Group").selectOption({ label: "Chem grind" });
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByTestId("invite-card")).toContainText("You invited Leo to Chem grind");
  await expect(leoPage.getByTestId("invite-card")).toContainText("Mia invited you to Chem grind", { timeout: 25_000 });
  await leoPage.getByRole("button", { name: "Join Chem grind" }).click();
  await expect(leoPage).toHaveURL(new RegExp(`/student/groups/${groupId}`));
  await expect(leoPage.getByRole("heading", { name: "Chem grind" })).toBeVisible();

  // Leo reports Mia's message, then blocks her: the chat closes for both.
  await leoPage.goto(`/student/messages/${mia.id}`);
  leoPage.once("dialog", (d) => d.accept("testing reports"));
  await leoPage.getByRole("button", { name: "Message options" }).first().click();
  await leoPage.getByRole("button", { name: "Report" }).click();
  await expect(leoPage.getByText("Thanks. A moderator will look at it.")).toBeVisible();
  const { data: reports } = await admin.from("dm_reports").select("reason").eq("reporter_id", leo.id);
  expect(reports).toEqual([{ reason: "testing reports" }]);
  await leoPage.getByText("Options ⋯").click();
  await leoPage.getByRole("button", { name: "Block Mia" }).click();
  await page.reload();
  await expect(page.getByText("You can only message friends.")).toBeVisible();
});
