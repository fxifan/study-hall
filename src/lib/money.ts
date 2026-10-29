/** "A$49" or "A$32.50" from cents. Plans are AUD-only for now. */
export function formatAud(cents: number): string {
  return `A$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
}
