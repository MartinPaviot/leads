import { describe, expect, it } from "vitest";
import {
  collectCitationUrls,
  decideCitationGate,
} from "@/lib/sequence-drafts/citations";

describe("collectCitationUrls", () => {
  it("collects unique http(s) hrefs and ignores everything else", () => {
    const urls = collectCitationUrls([
      { kind: "signal", label: "Job posting", href: "https://acme.com/careers/ea" },
      { kind: "signal", label: "Same posting", href: "https://acme.com/careers/ea" },
      { kind: "fact", label: "Industry", href: undefined },
      { kind: "quote", label: "Call quote", quote: "we struggle with X" },
      { kind: "signal", label: "Weird", href: "ftp://files.acme.com/x" },
      { kind: "signal", label: "Malformed", href: "https://" },
      { kind: "signal", label: "Blog", href: "  http://blog.acme.com/offsite  " },
    ]);
    expect(urls).toEqual(["https://acme.com/careers/ea", "http://blog.acme.com/offsite"]);
  });

  it("returns [] for null/undefined/non-array sources", () => {
    expect(collectCitationUrls(null)).toEqual([]);
    expect(collectCitationUrls(undefined)).toEqual([]);
  });
});

describe("decideCitationGate", () => {
  it("passes when every citation verified", () => {
    const gate = decideCitationGate([
      { url: "https://a.com/x", verified: true, reason: "ok" },
      { url: "https://b.com/y", verified: true, reason: "blocked_cdn" },
    ]);
    expect(gate.ok).toBe(true);
  });

  it("fails closed on ANY unverified citation, with a founder-readable reason", () => {
    const gate = decideCitationGate([
      { url: "https://a.com/x", verified: true, reason: "ok" },
      { url: "https://acme.com/careers/ea", verified: false, reason: "fetch_error:404" },
    ]);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.deadUrls).toEqual(["https://acme.com/careers/ea"]);
      expect(gate.reviewReason).toContain("https://acme.com/careers/ea");
      expect(gate.reviewReason).toContain("unreachable");
    }
  });

  it("truncates long dead-URL lists in the reason but reports them all", () => {
    const results = ["a", "b", "c", "d", "e"].map((h) => ({
      url: `https://${h}.com/x`,
      verified: false,
      reason: "timeout",
    }));
    const gate = decideCitationGate(results);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.deadUrls).toHaveLength(5);
      expect(gate.reviewReason).toContain("+2 more");
    }
  });

  it("a transient timeout also blocks — review beats a dead link", () => {
    const gate = decideCitationGate([
      { url: "https://slow.com/x", verified: false, reason: "timeout" },
    ]);
    expect(gate.ok).toBe(false);
  });
});
