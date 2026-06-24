import { describe, it, expect } from "vitest";
import { providerRank, pickWinner, DEFAULT_RANK } from "../precedence";

describe("providerRank", () => {
  it("ranks manual highest, registries above vendors, unknown to default", () => {
    expect(providerRank("manual")).toBeGreaterThan(providerRank("sirene"));
    expect(providerRank("sirene")).toBeGreaterThan(providerRank("apollo"));
    expect(providerRank("apollo")).toBeGreaterThan(providerRank("inferred"));
    expect(providerRank("some_new_vendor")).toBe(DEFAULT_RANK);
  });
});

describe("pickWinner", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  const t1 = new Date("2026-06-01T00:00:00Z");

  it("returns null for an empty set", () => {
    expect(pickWinner([])).toBeNull();
  });

  it("picks the highest provider rank regardless of recency", () => {
    const w = pickWinner([
      { provider: "apollo", value: "Apollo SA", observedAt: t1 },
      { provider: "manual", value: "Real Name", observedAt: t0 },
    ]);
    expect(w?.value).toBe("Real Name");
  });

  it("breaks ties on the most recent observed_at", () => {
    const w = pickWinner([
      { provider: "apollo", value: "old", observedAt: t0 },
      { provider: "apollo", value: "new", observedAt: t1 },
    ]);
    expect(w?.value).toBe("new");
  });

  it("is order-independent", () => {
    const a = pickWinner([
      { provider: "apollo", value: "a", observedAt: t1 },
      { provider: "sirene", value: "b", observedAt: t0 },
    ]);
    const b = pickWinner([
      { provider: "sirene", value: "b", observedAt: t0 },
      { provider: "apollo", value: "a", observedAt: t1 },
    ]);
    expect(a?.value).toBe(b?.value);
    expect(a?.value).toBe("b");
  });
});
