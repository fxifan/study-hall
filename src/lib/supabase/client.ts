"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "./config";

let client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Browser client, signed in as the current user via the session cookie. Only used for Realtime
 * subscriptions (group chat): RLS decides which rows a member can receive. Writes go through
 * Server Actions.
 */
export function browserClient() {
  client ??= createBrowserClient(supabaseUrl, supabaseKey);
  return client;
}
