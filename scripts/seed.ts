/**
 * Dev seed. Run with `npm run db:seed` after `npm run db:migrate`. Safe to re-run.
 * Uses the service role, so it bypasses RLS. Refuses to run with NODE_ENV=production.
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, loadEnv, requireEnv } from "./lib/env";
import {
  HOUSE_RULES_VERSION,
  PRIVACY_VERSION,
  SEED_ACCOUNTS,
  SEED_IDS,
  seedEmail,
  type SeedAccount,
} from "./seed-data";

loadEnv();

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
}

/** Create (or update) the auth user, then make sure its profile has the right role and org. */
async function ensureAccount(admin: SupabaseClient, account: SeedAccount): Promise<string> {
  const { role, fullName } = SEED_ACCOUNTS[account];
  const email = seedEmail(account);
  const appMetadata = { role, org_id: SEED_IDS.org };

  let userId = await findUserIdByEmail(admin, email);
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`Creating ${email}: ${error.message}`);
    userId = data.user.id;
  }

  // The auth trigger creates the profile; upsert anyway so role and name are right on re-runs.
  await upsert(admin, "profiles", { id: userId, org_id: SEED_IDS.org, role, full_name: fullName, email });
  return userId;
}

async function upsert(admin: SupabaseClient, table: string, rows: object | object[], onConflict = "id") {
  const { error } = await admin.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`Upserting ${table}: ${error.message}`);
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed with NODE_ENV=production.");
  const admin = createAdminClient();
  console.log(`Seeding ${new URL(requireEnv("NEXT_PUBLIC_SUPABASE_URL")).host}`);

  // The org must exist before any auth user, because the profile trigger needs one.
  await upsert(admin, "orgs", { id: SEED_IDS.org, name: "Study Hall" });

  const ids = {} as Record<SeedAccount, string>;
  for (const account of Object.keys(SEED_ACCOUNTS) as SeedAccount[]) {
    ids[account] = await ensureAccount(admin, account);
  }

  await upsert(admin, "plans", {
    id: SEED_IDS.plan,
    org_id: SEED_IDS.org,
    name: "Unlimited weeknights",
    price_cents: 4900,
    currency: "AUD",
    interval: "week",
    days_per_week: null,
    active: true,
  });

  await upsert(admin, "proctor_checks", {
    id: SEED_IDS.proctorCheck,
    proctor_id: ids.proctor,
    wwcc_number: "TEST-0000000-0",
    wwcc_expiry: "2030-12-31",
    verified_at: new Date().toISOString(),
    verified_by: ids.admin,
  });

  await upsert(admin, "rooms", {
    id: SEED_IDS.room,
    org_id: SEED_IDS.org,
    name: "Room 1",
    video_url: "https://example.com/replace-with-zoom-or-meet-link",
    capacity: 40,
    default_proctor_id: ids.proctor,
  });

  await upsert(admin, "schedules", {
    id: SEED_IDS.schedule,
    room_id: SEED_IDS.room,
    days_of_week: [1, 2, 3, 4],
    start_time: "16:00",
    end_time: "20:00",
    timezone: "Australia/Melbourne",
    block_minutes: 50,
    break_minutes: 10,
    active: true,
  });

  await upsert(admin, "students", [
    {
      id: SEED_IDS.studentA,
      org_id: SEED_IDS.org,
      profile_id: ids.studentA,
      first_name: "Ava",
      last_initial: "A",
      year_level: 11,
      school: "Example Secondary College",
      status: "active",
    },
    {
      id: SEED_IDS.studentA2,
      org_id: SEED_IDS.org,
      profile_id: null,
      first_name: "Leo",
      last_initial: "A",
      year_level: 9,
      school: null,
      status: "invited",
    },
    {
      id: SEED_IDS.studentB,
      org_id: SEED_IDS.org,
      profile_id: ids.studentB,
      first_name: "Noah",
      last_initial: "B",
      year_level: 12,
      school: null,
      status: "active",
    },
  ]);

  await upsert(
    admin,
    "parent_students",
    [
      { parent_id: ids.parentA, student_id: SEED_IDS.studentA },
      { parent_id: ids.parentA, student_id: SEED_IDS.studentA2 },
      { parent_id: ids.parentB, student_id: SEED_IDS.studentB },
    ],
    "parent_id,student_id",
  );

  // The two test families count as subscribed, so their parents land on /parent. Placeholder IDs:
  // there are no matching Stripe objects, so "Manage billing" is hidden for them.
  await upsert(
    admin,
    "subscriptions",
    [
      { parent: ids.parentA, ref: "seed-family-a" },
      { parent: ids.parentB, ref: "seed-family-b" },
    ].map(({ parent, ref }) => ({
      parent_id: parent,
      plan_id: SEED_IDS.plan,
      stripe_customer_id: null,
      stripe_subscription_id: ref,
      status: "active",
      quantity: 1,
      cancel_at_period_end: false,
      current_period_end: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })),
    "stripe_subscription_id",
  );

  // Legal documents the consent step cites (content/legal). The privacy notice is a draft.
  await upsert(
    admin,
    "legal_documents",
    [
      {
        org_id: SEED_IDS.org,
        document: "house_rules",
        version: HOUSE_RULES_VERSION,
        title: "House rules",
        body: readFileSync("content/legal/house-rules.md", "utf8"),
        is_draft: false,
      },
      {
        org_id: SEED_IDS.org,
        document: "privacy_child_safety",
        version: PRIVACY_VERSION,
        title: "Privacy & child safety notice",
        body: readFileSync("content/legal/privacy-draft.md", "utf8"),
        is_draft: true,
      },
    ],
    "org_id,document,version",
  );

  // Consents for the students who have finished sign-up. Recreated on each run to stay idempotent.
  const consented = [
    { student_id: SEED_IDS.studentA, parent_id: ids.parentA },
    { student_id: SEED_IDS.studentB, parent_id: ids.parentB },
  ];
  const { error: deleteError } = await admin
    .from("consents")
    .delete()
    .in("student_id", consented.map((c) => c.student_id));
  if (deleteError) throw deleteError;
  const { error: consentError } = await admin.from("consents").insert(
    consented.flatMap((c) => [
      { ...c, document: "house_rules", document_version: HOUSE_RULES_VERSION },
      { ...c, document: "privacy_child_safety", document_version: PRIVACY_VERSION },
    ]),
  );
  if (consentError) throw consentError;

  console.log("Seeded accounts (log in with `npm run login-link -- <account>`):");
  for (const account of Object.keys(SEED_ACCOUNTS) as SeedAccount[]) {
    console.log(`  ${account.padEnd(9)} ${SEED_ACCOUNTS[account].role.padEnd(8)} ${seedEmail(account)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
