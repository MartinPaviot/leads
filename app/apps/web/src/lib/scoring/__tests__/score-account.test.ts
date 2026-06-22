import { describe, it, expect } from "vitest";
import { scoreAccount, type ScoringCriterion, type IcpModel, type ScoredAccount } from "../score-account";

const crit = (id: string, fieldKey: string, operator: string, value: unknown, weight = 1, extra: Partial<ScoringCriterion> = {}): ScoringCriterion =>
  ({ id, fieldKey, operator, value, weight, ...extra });
const model = (criteria: ScoringCriterion[], tiers?: IcpModel["tiers"]): IcpModel => ({ criteria, tiers });
const acc = (fields: Record<string, unknown>, extra: Partial<ScoredAccount> = {}): ScoredAccount => ({ fields, ...extra });

describe("scoreAccount — weighted score + contributions (AC1)", () => {
  it("computes a [0,100] weighted score whose contributions reconstruct it", () => {
    const r = scoreAccount(acc({ industry: "Software", size: "small" }), model([crit("c1", "industry", "equals", "software", 2), crit("c2", "size", "equals", "large", 1)]));
    expect(r.score).toBe(67); // 100 * 2/3
    expect(r.qualification).toBe("qualified");
    const operableWeight = r.contributions.filter((c) => c.operable).reduce((s, c) => s + c.weight, 0);
    const points = r.contributions.reduce((s, c) => s + c.points, 0);
    expect(Math.round((100 * points) / operableWeight)).toBe(r.score); // explainable
  });
});

describe("scoreAccount — hard filters (AC2)", () => {
  it("suppressed short-circuits to disqualified", () => {
    expect(scoreAccount(acc({ industry: "Software" }, { suppressed: true }), model([crit("c1", "industry", "equals", "software", 1)]))).toMatchObject({ qualification: "disqualified", reason: "suppressed", score: 0 });
  });
  it("excludedReason disqualifies regardless of fit", () => {
    expect(scoreAccount(acc({ industry: "Software" }, { excludedReason: "anti_icp_industry" }), model([crit("c1", "industry", "equals", "software", 1)])).qualification).toBe("disqualified");
  });
  it("a matching exclusion criterion disqualifies", () => {
    const r = scoreAccount(acc({ industry: "Gambling" }), model([crit("e1", "industry", "equals", "gambling", 1, { isExclusion: true })]));
    expect(r.qualification).toBe("disqualified");
    expect(r.reason).toContain("exclusion");
  });
});

describe("scoreAccount — non-operable criteria (AC4)", () => {
  it("excludes a no-data criterion from the score and flags it (never silent zero)", () => {
    const r = scoreAccount(acc({ industry: "Software" }), model([crit("c1", "industry", "equals", "software", 1), crit("c2", "revenue", "gt", 1_000_000, 1)]));
    expect(r.score).toBe(100); // revenue (no data) excluded, not scored 0
    const rev = r.contributions.find((c) => c.fieldKey === "revenue")!;
    expect(rev.operable).toBe(false);
    expect(rev.points).toBe(0);
  });
});

describe("scoreAccount — partition (AC3)", () => {
  it("needs-review when a required criterion can't be evaluated", () => {
    const r = scoreAccount(acc({ industry: "Software" }), model([crit("c1", "siren", "exists", null, 1, { isRequired: true })]));
    expect(r.qualification).toBe("needs-review");
  });
  it("disqualified when an operable required criterion is unmatched", () => {
    const r = scoreAccount(acc({ country: "US" }), model([crit("c1", "country", "equals", "FR", 1, { isRequired: true })]));
    expect(r.qualification).toBe("disqualified");
    expect(r.reason).toContain("required");
  });
});

describe("scoreAccount — tiers (AC5) + determinism", () => {
  const four = [crit("a", "f1", "equals", "x", 1), crit("b", "f2", "equals", "x", 1), crit("c", "f3", "equals", "x", 1), crit("d", "f4", "equals", "x", 1)];
  it("assigns a tier from the score", () => {
    expect(scoreAccount(acc({ f1: "x", f2: "x", f3: "x", f4: "x" }), model(four)).tier).toBe("A"); // 100
    expect(scoreAccount(acc({ f1: "x", f2: "x", f3: "x", f4: "y" }), model(four)).tier).toBe("A"); // 75
    const half = scoreAccount(acc({ f1: "x", f2: "x", f3: "y", f4: "y" }), model(four));
    expect(half.score).toBe(50);
    expect(half.tier).toBe("B");
    expect(scoreAccount(acc({ f1: "x", f2: "y", f3: "y", f4: "y" }), model(four)).tier).toBe("C"); // 25
  });
  it("is a pure function of (account, model)", () => {
    const a = acc({ industry: "Software" });
    const m = model([crit("c1", "industry", "equals", "software", 1)]);
    expect(scoreAccount(a, m)).toEqual(scoreAccount(a, m));
  });
});
