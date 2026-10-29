/**
 * Apply supabase/migrations to the database in SUPABASE_DB_URL (`npm run db:migrate`).
 * Extra arguments pass through to `supabase db push`, e.g. `npm run db:migrate -- --dry-run`.
 */
import { spawnSync } from "node:child_process";
import { loadEnv, requireEnv } from "./lib/env";

loadEnv();

const result = spawnSync(
  "npx",
  ["supabase", "db", "push", "--db-url", requireEnv("SUPABASE_DB_URL"), "--yes", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
