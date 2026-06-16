import { describe, it, expect } from "vitest";
import { looksRtl, dirOf } from "@/lib/inbox/text-direction";

describe("looksRtl (INBOX-R10)", () => {
  it("detects Hebrew and Arabic as RTL", () => {
    expect(looksRtl("שלום עולם")).toBe(true);
    expect(looksRtl("مرحبا بالعالم")).toBe(true);
  });

  it("is robust to an LTR prefix on RTL content (e.g. 'Re:')", () => {
    expect(looksRtl("Re: שלום, מה שלומך היום")).toBe(true);
  });

  it("treats Latin-only text as LTR", () => {
    expect(looksRtl("Bonjour, comment ça va ?")).toBe(false);
    expect(looksRtl("Hello world")).toBe(false);
  });

  it("treats predominantly-Latin mixed text as LTR", () => {
    expect(looksRtl("Meeting notes شكرا")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(looksRtl("")).toBe(false);
  });
});

describe("dirOf", () => {
  it("maps to rtl / ltr", () => {
    expect(dirOf("שלום")).toBe("rtl");
    expect(dirOf("hello")).toBe("ltr");
  });
});
