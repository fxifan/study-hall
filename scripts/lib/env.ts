import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Load .env.local into process.env (values already set in the shell win). */
export function loadEnv() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

/** Service-role client for scripts and tests. Bypasses RLS: never import this from src/. */
export function createAdminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
