import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const baseURL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Key flows against the Supabase project in .env.local. Needs `npm run db:seed` first.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1, // every spec shares the one development database
  retries: 0,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
