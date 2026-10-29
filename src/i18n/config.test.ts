import { describe, expect, it } from "vitest";
import { localizePath, negotiateLocale, splitLocale } from "./config";

describe("splitLocale", () => {
  it("splits a locale prefix off the path", () => {
    expect(splitLocale("/zh/parent")).toEqual({ locale: "zh", path: "/parent" });
    expect(splitLocale("/zh")).toEqual({ locale: "zh", path: "/" });
    expect(splitLocale("/en/login")).toEqual({ locale: "en", path: "/login" });
  });

  it("leaves unprefixed paths and look-alikes alone", () => {
    expect(splitLocale("/parent")).toEqual({ locale: null, path: "/parent" });
    expect(splitLocale("/")).toEqual({ locale: null, path: "/" });
    expect(splitLocale("/zhx/parent")).toEqual({ locale: null, path: "/zhx/parent" });
  });
});

describe("localizePath", () => {
  it("keeps English unprefixed and prefixes Chinese", () => {
    expect(localizePath("/parent", "en")).toBe("/parent");
    expect(localizePath("/parent", "zh")).toBe("/zh/parent");
    expect(localizePath("/", "zh")).toBe("/zh");
    expect(localizePath("/login?error=link", "zh")).toBe("/zh/login?error=link");
  });
});

describe("negotiateLocale", () => {
  it("picks Chinese for any Chinese variant the browser prefers", () => {
    expect(negotiateLocale("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(negotiateLocale("zh-TW")).toBe("zh");
    expect(negotiateLocale("fr-FR,zh-CN;q=0.8,en;q=0.5")).toBe("zh");
  });

  it("respects q-values and defaults to English", () => {
    expect(negotiateLocale("en-AU,en;q=0.9,zh-CN;q=0.8")).toBe("en");
    expect(negotiateLocale("en;q=0.5,zh;q=0.9")).toBe("zh");
    expect(negotiateLocale("fr-FR")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("zh;q=0")).toBe("en");
  });
});
