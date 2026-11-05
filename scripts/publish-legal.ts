/**
 * Publishes the current house rules and privacy notice (content/legal) to legal_documents,
 * without re-seeding anything else (the seed overwrites real rooms and staff). Run after merging
 * a change to either document:
 *   npm run legal:publish
 */
import { readFileSync } from "node:fs";
import { createAdminClient, loadEnv } from "./lib/env";
import { HOUSE_RULES_VERSION, PRIVACY_VERSION, SEED_IDS } from "./seed-data";

loadEnv();

async function main() {
  const { error } = await createAdminClient()
    .from("legal_documents")
    .upsert(
      [
        { org_id: SEED_IDS.org, document: "house_rules", version: HOUSE_RULES_VERSION, title: "House rules", body: readFileSync("content/legal/house-rules.md", "utf8"), is_draft: false },
        { org_id: SEED_IDS.org, document: "privacy_child_safety", version: PRIVACY_VERSION, title: "Privacy & child safety notice", body: readFileSync("content/legal/privacy-draft.md", "utf8"), is_draft: true },
      ],
      { onConflict: "org_id,document,version" },
    );
  if (error) throw error;
  console.log(`Published house rules ${HOUSE_RULES_VERSION} and privacy notice ${PRIVACY_VERSION}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
