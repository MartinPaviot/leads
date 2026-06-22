import { describe, it, expect } from "vitest";
import { decideFreshnessGate, isVolatileSource } from "../freshness-gate";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe("decideFreshnessGate", () => {
  it("no volatile sources -> ok (even with an old brief)", () => {
    expect(decideFreshnessGate([{ kind: "signal" }, { kind: "news" }], daysAgo(100), new Date()).ok).toBe(true);
  });

  it("funding fact older than 14d -> stale recall", () => {
    const g = decideFreshnessGate([{ kind: "funding" }], daysAgo(20), new Date());
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.staleKinds).toContain("funding");
      expect(g.reviewReason).toContain("stale");
    }
  });

  it("funding fact within 14d -> fresh", () => {
    expect(decideFreshnessGate([{ kind: "funding" }], daysAgo(13), new Date()).ok).toBe(true);
  });

  it("unknown brief date -> ok (never recall on an undatable fact)", () => {
    expect(decideFreshnessGate([{ kind: "funding" }], null, new Date()).ok).toBe(true);
  });
});

describe("isVolatileSource", () => {
  it("funding/headcount are volatile; others are not", () => {
    expect(isVolatileSource({ kind: "funding" })).toBe(true);
    expect(isVolatileSource({ kind: "headcount" })).toBe(true);
    expect(isVolatileSource({ kind: "signal" })).toBe(false);
    expect(isVolatileSource(null)).toBe(false);
  });
});
