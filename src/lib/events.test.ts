import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => ({}) }));
const { cleanProps } = await import("./events");

describe("event properties", () => {
  it("keep only operational metadata", () => {
    expect(cleanProps({ plan: "solo", status: "active", name: "Ava", email: "a@b.c", transcript: "secret", note: "x", count: 3 })).toEqual({
      plan: "solo",
      status: "active",
      count: 3,
    });
    expect(cleanProps({ langs: ["en", "zh-CN"], reason: "x".repeat(100) })).toEqual({ langs: "en,zh-CN", reason: "x".repeat(60) });
  });
});
