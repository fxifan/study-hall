import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, requireEnv } from "../scripts/lib/env";
import { seedEmail, type SeedAccount } from "../scripts/seed-data";

function publicClient(): SupabaseClient {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A client with no session: what a signed-out visitor gets. */
export function signedOutClient(): SupabaseClient {
  return publicClient();
}

/**
 * A client signed in as a seeded account, through the real magic-link verification path
 * (generate the link server-side, then verify its token hash), without sending an email.
 */
export async function signInAs(account: SeedAccount): Promise<SupabaseClient> {
  const email = seedEmail(account);
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`No magic link for ${email} (${error.message}). Run \`npm run db:seed\` first.`);

  const client = publicClient();
  const { error: verifyError } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) throw new Error(`Verifying link for ${email}: ${verifyError.message}`);
  return client;
}

export async function userIdOf(account: SeedAccount): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("email", seedEmail(account))
    .single();
  if (error) throw new Error(`No profile for ${seedEmail(account)}. Run \`npm run db:seed\` first.`);
  return data.id;
}

export function sortedIds(rows: { id: string }[] | null): string[] {
  return (rows ?? []).map((r) => r.id).sort();
}
