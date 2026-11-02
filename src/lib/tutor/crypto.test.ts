import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskTail, tryDecrypt } from "./crypto";

beforeAll(() => {
  process.env.TUTOR_DATA_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("bank detail encryption", () => {
  it("round-trips and never stores the plaintext", () => {
    const stored = encryptSecret("12345678");
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain("12345678");
    expect(decryptSecret(stored)).toBe("12345678");
    expect(encryptSecret("12345678")).not.toBe(stored); // fresh IV each time
  });

  it("rejects tampering and survives a bad value", () => {
    const [v, iv, tag, data] = encryptSecret("063-000").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
    expect(tryDecrypt("garbage")).toBeNull();
    expect(tryDecrypt(null)).toBeNull();
  });

  it("masks", () => {
    expect(maskTail("12345678")).toBe("•••• 678");
  });
});
