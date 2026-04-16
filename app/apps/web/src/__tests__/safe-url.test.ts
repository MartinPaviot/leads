import { describe, it, expect } from "vitest";
import { safeUrl, isSafeUrl } from "@/lib/util/safe-url";

describe("safeUrl — happy path", () => {
  it("accepts http(s) URLs", () => {
    expect(safeUrl("https://elevay.com")).toBe("https://elevay.com/");
    expect(safeUrl("http://elevay.com/path?q=1")).toBe("http://elevay.com/path?q=1");
  });

  it("normalises a bare domain to https://", () => {
    expect(safeUrl("elevay.com")).toBe("https://elevay.com");
    expect(safeUrl("acme.co.uk/about")).toBe("https://acme.co.uk/about");
  });

  it("accepts mailto: and tel: with payloads", () => {
    expect(safeUrl("mailto:hi@elevay.com")).toBe("mailto:hi@elevay.com");
    expect(safeUrl("tel:+15551234567")).toBe("tel:+15551234567");
  });

  it("accepts same-origin relative paths", () => {
    expect(safeUrl("/accounts")).toBe("/accounts");
    expect(safeUrl("/accept-invite?token=abc")).toBe("/accept-invite?token=abc");
  });

  it("trims surrounding whitespace", () => {
    expect(safeUrl("  https://elevay.com  ")).toBe("https://elevay.com/");
  });
});

describe("safeUrl — XSS rejection", () => {
  it("rejects javascript: in any case", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeUrl("JaVaScRiPt:alert(1)")).toBeNull();
  });

  it("rejects javascript: hidden behind control chars (\\t, \\n, \\r)", () => {
    // Browsers strip these and resolve to javascript: — must be caught here.
    expect(safeUrl("\tj\nava\rscript:alert(1)")).toBeNull();
    expect(safeUrl("\u0009javascript:alert(1)")).toBeNull();
    expect(safeUrl("\u200Bjavascript:alert(1)")).toBeNull();
  });

  it("rejects data: URLs (often used for inline scripts)", () => {
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects vbscript: and file: and blob: and about:", () => {
    expect(safeUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeUrl("file:///etc/passwd")).toBeNull();
    expect(safeUrl("blob:https://evil/abc")).toBeNull();
    expect(safeUrl("about:blank")).toBeNull();
  });

  it("rejects malformed http(s) URLs", () => {
    expect(safeUrl("http://[invalid")).toBeNull();
    expect(safeUrl("https://")).toBeNull();
  });
});

describe("safeUrl — empty / nullish input", () => {
  it("returns null for nullish inputs", () => {
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
    expect(safeUrl("")).toBeNull();
    expect(safeUrl("   ")).toBeNull();
  });

  it("returns null for non-string inputs", () => {
    expect(safeUrl(42 as unknown as string)).toBeNull();
    expect(safeUrl({} as unknown as string)).toBeNull();
  });

  it("rejects mailto:/tel: without a payload", () => {
    expect(safeUrl("mailto:")).toBeNull();
    expect(safeUrl("tel:")).toBeNull();
  });

  it("rejects scheme-relative URLs (//evil.com) — treated as unknown scheme", () => {
    expect(safeUrl("//evil.com")).toBeNull();
  });
});

describe("isSafeUrl", () => {
  it("mirrors safeUrl as a boolean", () => {
    expect(isSafeUrl("https://elevay.com")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
  });
});
