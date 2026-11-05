/**
 * Imports curriculum points (scripts/curriculum-data.ts) as UNPUBLISHED rows. Safe to re-run: a
 * point that already exists (same framework, subject, unit or level, area and summary) is left as
 * it is, including whether an admin published it.
 *   npm run curriculum:import
 */
import { createAdminClient, loadEnv } from "./lib/env";
import { CURRICULUM_POINTS } from "./curriculum-data";

loadEnv();

async function main() {
  const admin = createAdminClient();
  const rows = CURRICULUM_POINTS.map((p, i) => ({
    framework: p.framework,
    subject: p.subject,
    unit_or_level: p.unitOrLevel,
    area: p.area,
    summary: p.summary,
    accreditation: p.accreditation ?? null,
    source_url: p.sourceUrl,
    sort: i,
  }));
  const { data, error } = await admin
    .from("curriculum_points")
    .upsert(rows, { onConflict: "framework,subject,unit_or_level,area,summary", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  console.log(`${rows.length} points in the data; ${data?.length ?? 0} new. Review and publish them at /admin/curriculum.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
