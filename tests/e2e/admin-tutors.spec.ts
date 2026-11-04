/**
 * /admin/tutors (owner request, 4 Nov 2026): admins see tutors' activity counts and grant, suspend
 * or restore tutor access. Family accounts are never converted. Cleans up the login it creates.
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { seedEmail, type SeedAccount } from "../../scripts/seed-data";

loadEnv();
const admin = createAdminClient();

async function logIn(page: Page, account: SeedAccount) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: seedEmail(account) });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
}

test("admins grant, suspend and restore tutor access", async ({ page }) => {
  const email = `granted-${Date.now()}@studyhall.test`;
  await logIn(page, "admin");
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Tutors", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tutors");
  const grant = page.getByTestId("grant-tutor");

  // A family's email is refused, not converted.
  await grant.getByLabel("Name").fill("Not A Tutor");
  await grant.getByLabel("Email").fill(seedEmail("parentA"));
  await grant.getByRole("button", { name: "Grant access" }).click();
  await expect(page.getByText("already has a family or staff account")).toBeVisible();
  expect((await admin.from("profiles").select("role").eq("email", seedEmail("parentA")).single()).data?.role).toBe("parent");

  let id: string | undefined;
  try {
    await grant.getByLabel("Name").fill("Granted Tutor");
    await grant.getByLabel("Email").fill(email);
    await grant.getByRole("button", { name: "Grant access" }).click();
    await expect(page.getByText("Access granted")).toBeVisible();
    const profile = (await admin.from("profiles").select("id, role").eq("email", email).single()).data;
    expect(profile?.role).toBe("tutor");
    const tutorId = profile!.id;
    id = tutorId;
    expect((await admin.from("tutors").select("plan").eq("id", tutorId).single()).data?.plan).toBe("trial");

    const row = page.getByTestId("tutor-table").locator("tr", { hasText: email });
    await expect(row).toContainText("Never signed in");
    await expect(row).toContainText("0 / 0"); // families / students: counts, never names
    await row.getByRole("button", { name: "Suspend" }).click();
    await expect(row).toContainText("Suspended");
    expect((await admin.auth.admin.getUserById(tutorId)).data.user?.banned_until).toBeTruthy();

    await row.getByRole("button", { name: "Restore" }).click();
    await expect(row.getByRole("button", { name: "Suspend" })).toBeVisible();
    const until = (await admin.auth.admin.getUserById(tutorId)).data.user?.banned_until;
    expect(!until || Date.parse(until) <= Date.now()).toBe(true);
  } finally {
    if (id) await admin.auth.admin.deleteUser(id);
  }
});


test("admins can open the tutor app as their own workspace", async ({ page }) => {
  await logIn(page, "admin");
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: /Tutor app/ }).click();
  await expect(page).toHaveURL("/app");
  const { data: me } = await admin.from("profiles").select("id").eq("email", seedEmail("admin")).single();
  const row = (await admin.from("tutors").select("plan").eq("id", me!.id).single()).data;
  expect(row?.plan).toBe("solo");
  await page.goto("/app/settings");
  await expect(page.getByText(/Solo plan/)).toBeVisible();
  // Supervisors still can't.
  await logIn(page, "proctor");
  await page.goto("/app");
  await expect(page).toHaveURL("/proctor");
});
