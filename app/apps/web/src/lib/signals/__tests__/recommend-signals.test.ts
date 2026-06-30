import { describe, it, expect, vi, beforeEach } from "vitest";

// Datasets keyed by the (mocked) schema table tag.
const datasets: Record<string, unknown[]> = { icps: [], icp_criteria: [], companies: [] };
vi.mock("@/db/schema", () => ({ icps: { __t: "icps" }, icpCriteria: { __t: "icp_criteria" }, companies: { __t: "companies" } }));
vi.mock("drizzle-orm", () => ({ and: (...a: unknown[]) => a, eq: (...a: unknown[]) => a, inArray: (...a: unknown[]) => a }));
function makeChain() {
  let t = "";
  const c: Record<string, unknown> = {
    from: (x: { __t: string }) => { t = x.__t; return c; },
    where: () => c,
    limit: () => Promise.resolve(datasets[t] ?? []),
    then: (res: (v: unknown) => unknown) => res(datasets[t] ?? []),
  };
  return c;
}
vi.mock("@/db", () => ({ db: { select: () => makeChain() } }));

const getSignalMultipliers = vi.fn();
const PRIORS: Record<string, number> = { funding: 1.5, funding_crunchbase: 1.5, hiring: 1.4, hiring_surge: 1.5, executive_hire: 1.4, leadership_change: 1.3, tech_stack_change: 1.3, investor_overlap: 1.4, warm_connection: 1.8, acquisition: 1.6, positive_reply: 2.5 };
vi.mock("@/lib/scoring/signal-outcomes", () => ({
  getSignalMultipliers: (...a: unknown[]) => getSignalMultipliers(...a),
  priorMultiplier: (t: string) => PRIORS[t] ?? 1,
}));

const detectActiveSignals = vi.fn((props: { __signals?: { type: string }[] }) => props.__signals ?? []);
vi.mock("@/lib/scoring/signal-detectors", () => ({ detectActiveSignals: (...a: unknown[]) => detectActiveSignals(...(a as [{ __signals?: { type: string }[] }])) }));

import { recommendSignals } from "../recommend-signals";
import { appliesToIcp, catalogEntry, SIGNAL_CATALOG } from "../signal-catalog";

const company = (...types: string[]) => ({ properties: { __signals: types.map((type) => ({ type, firedAt: new Date() })) } });

beforeEach(() => {
  vi.clearAllMocks();
  datasets.icps = [{ id: "icp1" }];
  datasets.icp_criteria = [{ fieldKey: "industry", value: ["SaaS"] }, { fieldKey: "person_seniorities", value: ["c_suite"] }];
  // 10 accounts: 4 funding, 1 tech_stack_change (40% vs 10% coverage)
  datasets.companies = [company("funding"), company("funding"), company("funding"), company("funding"), company("tech_stack_change"), company(), company(), company(), company(), company()];
  getSignalMultipliers.mockResolvedValue({ multipliers: {}, baselineWinRate: 0.2, totalOutcomes: 0 });
});

describe("appliesToIcp (pure)", () => {
  const sig = (type: string) => catalogEntry(type)!;
  it("a broad signal applies to any ICP", () => {
    expect(appliesToIcp(sig("tech_stack_change"), ["Healthcare"], ["ic"])).toBe(true);
  });
  it("a persona-restricted signal is filtered out for the wrong persona", () => {
    expect(appliesToIcp(sig("executive_hire"), [], ["ic"])).toBe(false); // exec/vp only
    expect(appliesToIcp(sig("executive_hire"), [], ["exec"])).toBe(true);
  });
  it("no ICP context → everything applies", () => {
    expect(SIGNAL_CATALOG.every((s) => appliesToIcp(s, [], []))).toBe(true);
  });
});

describe("recommendSignals", () => {
  it("profiles real TAM coverage and ranks higher-coverage property signals above lower", async () => {
    const r = await recommendSignals("t1", { limit: 20 });
    expect(r.totalAccounts).toBe(10);
    const funding = r.recommendations.find((s) => s.type === "funding")!;
    const tech = r.recommendations.find((s) => s.type === "tech_stack_change")!;
    expect(funding.coverage).toEqual({ count: 4, total: 10, pct: 0.4 });
    expect(tech.coverage).toEqual({ count: 1, total: 10, pct: 0.1 });
    // funding (40% cov, 1.5×) outranks tech (10% cov, 1.3×)
    expect(r.recommendations.indexOf(funding)).toBeLessThan(r.recommendations.indexOf(tech));
    expect(funding.score).toBeGreaterThan(tech.score);
  });

  it("monitor/event signals carry no coverage (null) but still surface", async () => {
    const r = await recommendSignals("t1", { limit: 20 });
    const hiring = r.recommendations.find((s) => s.type === "hiring")!; // monitor
    expect(hiring.coverage).toBeNull();
    expect(hiring.detect).toBe("monitor");
  });

  it("labels weights as priors below the learned threshold, learned above it", async () => {
    const a = await recommendSignals("t1");
    expect(a.recommendations[0].multiplierSource).toBe("prior");
    expect(a.outcomesLearned).toBe(0);
    getSignalMultipliers.mockResolvedValue({ multipliers: { funding: 2.1 }, baselineWinRate: 0.2, totalOutcomes: 15 });
    const b = await recommendSignals("t1");
    expect(b.recommendations[0].multiplierSource).toBe("learned");
    // learned multiplier overrides the prior
    expect(b.recommendations.find((s) => s.type === "funding")!.multiplier).toBe(2.1);
  });

  it("respects the ICP persona filter (junior ICP drops exec-only signals)", async () => {
    datasets.icp_criteria = [{ fieldKey: "person_seniorities", value: ["entry"] }];
    const r = await recommendSignals("t1", { limit: 20 });
    expect(r.recommendations.find((s) => s.type === "executive_hire")).toBeUndefined();
  });

  it("returns ICP industries for context", async () => {
    const r = await recommendSignals("t1");
    expect(r.icpIndustries).toEqual(["SaaS"]);
  });
});
