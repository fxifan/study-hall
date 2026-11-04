import { AUD_PER_USD, UNIT_COSTS_USD } from "./config";

/** Estimated vendor cost of usage events, in AUD cents (spec §7). Unit prices are in config.ts. */
export type UsageTotals = { transcribe_seconds: number; llm_tokens: number; email: number };

export function costAudCents(t: UsageTotals): { transcribe: number; llm: number; email: number; total: number } {
  const usd = {
    transcribe: (t.transcribe_seconds / 60) * UNIT_COSTS_USD.transcribePerMinute,
    llm: (t.llm_tokens / 1_000_000) * UNIT_COSTS_USD.llmPerMillionTokens,
    email: t.email * UNIT_COSTS_USD.perEmail,
  };
  const cents = (v: number) => Math.round(v * AUD_PER_USD * 100 * 100) / 100; // keep 2 decimals of a cent
  const out = { transcribe: cents(usd.transcribe), llm: cents(usd.llm), email: cents(usd.email) };
  return { ...out, total: Math.round((out.transcribe + out.llm + out.email) * 100) / 100 };
}

export function sumUsage(rows: { kind: keyof UsageTotals; amount: number | string }[]): UsageTotals {
  const totals: UsageTotals = { transcribe_seconds: 0, llm_tokens: 0, email: 0 };
  for (const r of rows) totals[r.kind] += Number(r.amount);
  return totals;
}

/** "A$0.0123" for small amounts, "A$12.34" otherwise. */
export function formatAudCents(cents: number): string {
  const dollars = cents / 100;
  return `A$${dollars < 1 ? dollars.toFixed(4) : dollars.toFixed(2)}`;
}
