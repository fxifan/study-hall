import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level encryption for tutors' bank details (spec §6). AES-256-GCM with a key from
 * TUTOR_DATA_KEY (32 bytes, base64: `openssl rand -base64 32`). The database only ever sees
 * "v1:<iv>:<tag>:<ciphertext>". Never log the plaintext or pass it to the client except the masked form.
 *
 * Node's built-in crypto is used instead of libsodium: same guarantees (authenticated encryption),
 * no extra dependency.
 */
function key(): Buffer {
  const raw = process.env.TUTOR_DATA_KEY;
  if (!raw) throw new Error("TUTOR_DATA_KEY is not set.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("TUTOR_DATA_KEY must be 32 bytes, base64-encoded.");
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised encrypted value.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** null-safe: decrypt if present, null if absent or unreadable (e.g. after a key change). */
export function tryDecrypt(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}

/** "•••• 321" for showing a saved account number. */
export function maskTail(value: string | null, keep = 3): string | null {
  if (!value) return null;
  return `•••• ${value.slice(-keep)}`;
}
