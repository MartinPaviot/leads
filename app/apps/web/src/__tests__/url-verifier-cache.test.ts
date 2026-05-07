import { describe, it, expect } from "vitest";
import { canonicaliseUrl } from "@/lib/signals/url-verifier-cache";

describe("canonicaliseUrl", () => {
  it("lowercases the host", () => {
    expect(canonicaliseUrl("https://EXAMPLE.com/path")).toBe(
      "https://example.com/path",
    );
  });

  it("drops the fragment", () => {
    expect(canonicaliseUrl("https://example.com/page#section")).toBe(
      "https://example.com/page",
    );
  });

  it("strips utm tracking params but keeps real query params", () => {
    const out = canonicaliseUrl(
      "https://example.com/article?id=42&utm_source=email&utm_campaign=spring&q=keyword",
    );
    expect(out).toBe("https://example.com/article?id=42&q=keyword");
  });

  it("strips fbclid / gclid / ref / hsenc", () => {
    expect(
      canonicaliseUrl(
        "https://example.com/?fbclid=abc&gclid=xyz&ref=newsletter&_hsenc=foo&id=42",
      ),
    ).toBe("https://example.com/?id=42");
  });

  it("returns null for malformed URLs", () => {
    expect(canonicaliseUrl("not a url")).toBeNull();
    expect(canonicaliseUrl("")).toBeNull();
    expect(canonicaliseUrl("//missing-protocol")).toBeNull();
  });

  it("preserves the path and trailing slash policy of the input", () => {
    expect(canonicaliseUrl("https://example.com/")).toBe("https://example.com/");
    expect(canonicaliseUrl("https://example.com")).toBe("https://example.com/");
  });

  it("two URLs that only differ in tracking params canonicalise equally", () => {
    const a = canonicaliseUrl("https://example.com/x?id=1&utm_source=a");
    const b = canonicaliseUrl("https://example.com/x?id=1&utm_source=b&utm_campaign=c");
    expect(a).toBe(b);
  });
});
