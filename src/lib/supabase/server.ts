import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseKey, supabaseUrl } from "./config";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers. It acts as the
 * signed-in user, so every query goes through RLS. Create one per request.
 */
export async function createClient() {
  // Session reads always happen at request time. Without this, prerendering (Cache Components)
  // trips over the Date.now() that Supabase uses to check token expiry.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can't set cookies. The proxy refreshes the session instead.
        }
      },
    },
  });
}
