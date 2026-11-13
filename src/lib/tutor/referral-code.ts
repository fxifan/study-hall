import { randomBytes } from "node:crypto";

/** Tutor referral codes: 8 characters, capitals and digits without look-alikes (no 0, 1, I or O). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newReferralCode(): string {
  return Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function normaliseReferralCode(value: unknown): string | null {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : null;
}
