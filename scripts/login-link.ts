/**
 * Print a one-time magic login link without sending an email, for dev and testing.
 *   npm run login-link -- parentA        (a seeded account: admin, proctor, parentA, studentA, parentB, studentB)
 *   npm run login-link -- someone@x.com  (any existing user)
 * The link goes through the same /auth/confirm route as a real emailed link.
 */
import { createAdminClient, loadEnv } from "./lib/env";
import { SEED_ACCOUNTS, seedEmail, type SeedAccount } from "./seed-data";

loadEnv();

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error(`Usage: npm run login-link -- <${Object.keys(SEED_ACCOUNTS).join("|")}|email>`);
  const email = arg.includes("@") ? arg : seedEmail(arg as SeedAccount);
  if (!arg.includes("@") && !(arg in SEED_ACCOUNTS)) throw new Error(`Unknown seeded account "${arg}"`);

  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;

  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const url = new URL("/auth/confirm", site);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "magiclink");
  console.log(url.toString());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
