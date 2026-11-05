/**
 * Tutor resources (docs/tutor-resources-spec.md): an admin publishes curriculum points; a trial
 * tutor makes a practice set (offline model: run the dev server with TUTOR_RESOURCES_OFFLINE=1),
 * resolves the flagged answer, approves it, prints both copies, makes VCE English writing tips,
 * and is stopped at the trial limit. Unpublishes what it published and deletes its tutor.
 */
import { expect, test, type Page } from "@playwright/test";
import { createAdminClient, loadEnv } from "../../scripts/lib/env";
import { seedEmail } from "../../scripts/seed-data";

loadEnv();
const admin = createAdminClient();
const GROUPS = [
  { framework: "vce", subject: "Mathematical Methods", unit_or_level: "Units 3 and 4" },
  { framework: "vce", subject: "English", unit_or_level: "Units 3 and 4" },
];

async function magic(page: Page, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
}

test("admin publishes points; a trial tutor makes, checks, approves and prints resources", async ({ page }) => {
  test.setTimeout(90_000);
  const before = await admin.from("curriculum_points").select("id, is_published").in("subject", GROUPS.map((g) => g.subject));
  const email = `resources-${Date.now()}@studyhall.test`;
  let tutorId: string | undefined;
  try {
    // Admin: publish the two groups on /admin/curriculum.
    await magic(page, seedEmail("admin"));
    await page.goto("/admin/curriculum");
    for (const g of GROUPS) {
      const group = page.getByTestId("curriculum-group").filter({ hasText: `VCE · ${g.subject} · ${g.unit_or_level}` });
      await group.getByRole("button", { name: "Publish all", exact: true }).click();
      await expect
        .poll(async () => (await admin.from("curriculum_points").select("id").eq("subject", g.subject).eq("unit_or_level", g.unit_or_level).eq("is_published", false)).data?.length)
        .toBe(0);
    }

    // A tutor on the free trial.
    const { data: org } = await admin.from("orgs").select("id").limit(1).single();
    const { data: user } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "tutor", org_id: org!.id } });
    tutorId = user.user!.id;
    await admin.from("tutors").insert({ id: tutorId, display_name: "Resource Tutor" });
    await magic(page, email);
    await page.goto("/app/resources");
    await expect(page.getByTestId("resource-allowance")).toHaveText("3 of 3 left in your trial");

    // New practice set: level, points, settings.
    await page.getByRole("link", { name: "New practice set" }).click();
    await page.getByLabel("Subject and level").selectOption({ label: "VCE Mathematical Methods, Units 3 and 4" });
    await page.getByTestId("choose-level").getByRole("button", { name: "Next" }).click();
    const settings = page.getByTestId("resource-settings");
    await settings.getByLabel(/chain, product and quotient rules/).check();
    await settings.getByLabel(/tangents and normals/).check();
    await settings.getByLabel("Number of questions").fill("5");
    await settings.getByRole("button", { name: "Generate draft" }).click();

    // The draft: 5 questions, the second flagged by the answer check; approval waits for it.
    await expect(page.getByTestId("question")).toHaveCount(5);
    await expect(page.getByTestId("resource-status")).toContainText("AI draft");
    await expect(page.getByRole("button", { name: "1 flagged answer to check first" })).toBeDisabled();
    const flagged = page.getByTestId("question").nth(1);
    await flagged.getByRole("button", { name: "It's right, dismiss" }).click();
    await expect(flagged.getByRole("alert")).toHaveCount(0);

    // Edit a question: saved, and still a draft.
    const firstQ = page.getByTestId("question").first();
    await firstQ.getByText("Edit", { exact: true }).click();
    await firstQ.getByRole("textbox", { name: "Question", exact: true }).fill("Which value of x solves 2x + 1 = 9?");
    await firstQ.getByRole("button", { name: "Save question" }).click();
    await expect(page.getByTestId("question").first()).toContainText("Which value of x solves 2x + 1 = 9?");

    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByTestId("resource-status")).toContainText("Approved");
    const setUrl = page.url();

    // Print views: the student copy has no answers; the tutor copy does.
    await page.goto(`${setUrl}/print?copy=student`);
    await expect(page.getByText("Which value of x solves 2x + 1 = 9?")).toBeVisible();
    await expect(page.getByText("Answer:")).toHaveCount(0);
    await page.goto(`${setUrl}/print?copy=tutor`);
    await expect(page.getByText("Answer:").first()).toBeVisible();

    // Writing tips for VCE English.
    await page.goto("/app/resources/new?kind=writing_tips");
    await page.getByLabel("Level").selectOption({ label: "VCE English, Units 3 and 4" });
    await page.getByTestId("choose-level").getByRole("button", { name: "Next" }).click();
    await page.getByTestId("resource-settings").getByLabel(/how arguments and language are used to persuade/).check();
    await page.getByRole("button", { name: "Generate draft" }).click();
    await expect(page.getByTestId("tips-editor")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Writing tips: Analysing argument");

    // Library: both, and one trial resource left; deleting doesn't give one back.
    await page.goto("/app/resources");
    await expect(page.getByTestId("resource-list").locator("li")).toHaveCount(2);
    await expect(page.getByTestId("resource-allowance")).toHaveText("1 of 3 left in your trial");
    await page.goto(setUrl);
    await page.getByText("Rename or delete").click();
    await page.getByTestId("resource-status").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByTestId("resource-list").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("resource-allowance")).toHaveText("1 of 3 left in your trial");

    // At the trial limit, new resources are refused.
    await admin.from("tutor_usage_events").insert({ tutor_id: tutorId, kind: "llm_tokens", amount: 0, purpose: "resource" });
    await page.reload();
    await expect(page.getByText(/The free trial includes 3 resources/)).toBeVisible();
    await expect(page.getByRole("link", { name: "New practice set" })).toHaveCount(0);

    // Usage is logged as resources, not report drafts.
    const { data: usage } = await admin.from("tutor_usage_events").select("purpose").eq("tutor_id", tutorId);
    expect(usage!.every((u) => u.purpose !== "report")).toBe(true);
  } finally {
    if (tutorId) await admin.auth.admin.deleteUser(tutorId);
    for (const p of before.data ?? []) await admin.from("curriculum_points").update({ is_published: p.is_published }).eq("id", p.id);
  }
});

test("tutors can't see each other's resources, and only admins reach /admin/curriculum", async ({ page }) => {
  await magic(page, seedEmail("proctor"));
  await page.goto("/admin/curriculum");
  await expect(page).toHaveURL("/proctor");
  await page.goto("/app/resources");
  await expect(page).toHaveURL("/proctor");
});
