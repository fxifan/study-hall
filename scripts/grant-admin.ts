/**
 * Give someone admin access (admins can also supervise sessions once their WWCC is verified).
 *   npm run grant-admin -- someone@example.com "Full Name"
 * Creates the login if it doesn't exist (no email is sent: they log in at /login), or promotes an
 * existing staff login. Refuses to convert a parent or student account, so families keep theirs.
 */
import { createAdminClient, loadEnv } from "./lib/env";

loadEnv();

async function main() {
  const [rawEmail, fullName] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Usage: npm run grant-admin -- <email> "Full Name"');
  const admin = createAdminClient();

  const { data: orgs, error: orgError } = await admin.from("orgs").select("id, name");
  if (orgError) throw orgError;
  if (orgs?.length !== 1) throw new Error(`Expected one org, found ${orgs?.length ?? 0}.`);
  const orgId = orgs[0].id;

  const { data: existing } = await admin.from("profiles").select("id, role, full_name").eq("email", email).maybeSingle();
  let userId = existing?.id;
  if (existing && existing.role !== "admin" && existing.role !== "proctor") {
    throw new Error(`${email} is a ${existing.role} account. Use a different email for staff access.`);
  }
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { role: "admin", org_id: orgId },
      user_metadata: { full_name: fullName ?? "" },
    });
    if (error) throw error;
    userId = data.user.id;
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { role: "admin", org_id: orgId } });
    if (error) throw error;
  }
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, org_id: orgId, role: "admin", email, full_name: fullName ?? existing?.full_name ?? null });
  if (profileError) throw profileError;
  console.log(`${email} is an admin of ${orgs[0].name}${existing ? " (updated)" : " (new login)"}. They log in at /login.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
