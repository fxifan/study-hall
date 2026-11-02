/**
 * Run the report fixtures (src/lib/report/fixtures) through the real drafting model and print what
 * comes back, with the same grounding and safety checks the app applies. Needs OPENAI_API_KEY.
 *   npm run report:eval
 * Use it in week 1 to check quality and tokens per report (spec §7), and after any prompt change.
 */
import { openAiLlm, reportModel } from "../src/lib/llm";
import { FIXTURES } from "../src/lib/report/fixtures/transcripts";
import { generateReport } from "../src/lib/report/generate";
import { isSensitive } from "../src/lib/report/sensitive";
import { loadEnv } from "./lib/env";

loadEnv();

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set.");
  const llm = openAiLlm();
  let tokens = 0;
  let problems = 0;
  for (const f of Object.values(FIXTURES)) {
    const { draft, tokens: used } = await generateReport(
      { note: f.note, studentFirstName: f.student, subjects: f.subjects, durationMin: 60, yearLevel: 11, langs: ["en", "zh-CN"] },
      llm,
    );
    tokens += used;
    const all = Object.values(draft.body).flatMap((c) => (c ? [...c.covered, ...c.wentWell, ...c.nextFocus, ...c.homework, c.tutorNote] : []));
    const leaked = all.some(isSensitive);
    if (leaked) problems += 1;
    console.log(`\n## ${f.name}  (${used} tokens, dropped ${draft.dropped}, sensitive ${draft.sensitive}, too short ${draft.tooShort})`);
    console.log(JSON.stringify(draft.body, null, 2));
    if (leaked) console.log("!! sensitive content reached the report");
  }
  console.log(`\nModel ${reportModel()}: ${tokens} tokens for ${Object.keys(FIXTURES).length} notes. Problems: ${problems}.`);
  if (problems) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
