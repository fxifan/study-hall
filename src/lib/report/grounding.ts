/**
 * Grounding checks (docs/tutor-reports-spec.md §4): the draft may only use what the tutor said or
 * typed. The model returns a verbatim quote for each item; an item is kept only if its quote can be
 * found in the note. Works for English, Chinese and mixed notes (Chinese is compared per character).
 */

/** Lowercase, drop punctuation and symbols, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Latin words, and each CJK character as its own token. */
export function tokens(text: string): string[] {
  const n = normalize(text);
  return n.replace(/([㐀-鿿])/g, " $1 ").split(/\s+/).filter(Boolean);
}

const STOP = new Set([
  "a", "an", "the", "and", "or", "but", "to", "of", "in", "on", "at", "for", "with", "is", "was", "were", "be",
  "it", "this", "that", "we", "i", "he", "she", "they", "um", "uh", "like", "so", "just", "ok", "okay", "yeah",
]);

/** Enough to draft from: at least 4 meaningful words (or 8 Chinese characters). */
export function hasSourceMaterial(text: string): boolean {
  const meaningful = tokens(text).filter((t) => !STOP.has(t));
  const cjk = meaningful.filter((t) => /[㐀-鿿]/.test(t)).length;
  const latin = meaningful.length - cjk;
  return latin + cjk / 2 >= 4;
}

/**
 * True when the quote is in the source: an exact (normalized) substring, or, to forgive small
 * transcription and punctuation differences, at least 80% of the quote's tokens appear in order.
 */
export function quoteIsGrounded(quote: string, source: string): boolean {
  const q = normalize(quote);
  if (!q) return false;
  const s = normalize(source);
  if (s.includes(q)) return true;
  const qt = tokens(quote);
  const st = tokens(source);
  if (qt.length < 2) return false;
  let i = 0;
  let matched = 0;
  for (const t of qt) {
    const at = st.indexOf(t, i);
    if (at !== -1) {
      matched += 1;
      i = at + 1;
    }
  }
  return matched / qt.length >= 0.8;
}
