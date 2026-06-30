import { describe, it, expect, vi, beforeEach } from "vitest";

const recommendSignals = vi.fn();
vi.mock("@/lib/signals/recommend-signals", () => ({ recommendSignals: (...a: unknown[]) => recommendSignals(...a) }));

import { buildSignalRecommenderTools } from "../signal-recommender";

const ctx = { tenantId: "t1", userId: "u1" } as never;
const run = (input: unknown) => (buildSignalRecommenderTools(ctx).recommendSignals as never as { execute: (i: unknown) => Promise<Record<string, unknown>> }).execute(input);

beforeEach(() => {
  vi.clearAllMocks();
  recommendSignals.mockResolvedValue({
    totalAccounts: 320,
    outcomesLearned: 0,
    icpIndustries: ["SaaS"],
    recommendations: [
      { type: "funding", label: "Recent funding", rationale: "new budget", detect: "property", action: "enrich", multiplier: 1.5, multiplierSource: "prior", coverage: { count: 128, total: 320, pct: 0.4 }, score: 2.7 },
      { type: "hiring", label: "Hiring for the buying team", rationale: "team scaling", detect: "monitor", action: "create a Jobs monitor", multiplier: 1.4, multiplierSource: "prior", coverage: null, score: 1.74 },
    ],
  });
});

describe("recommendSignals tool", () => {
  it("shapes recommendations for the agent (coverage string + weighting note)", async () => {
    const r = await run({});
    expect(r).toMatchObject({ ok: true, accountsProfiled: 320, icpIndustries: ["SaaS"] });
    expect(r.weighting).toContain("priors");
    const recs = r.recommendations as Array<Record<string, unknown>>;
    expect(recs[0]).toMatchObject({ signal: "Recent funding", type: "funding", weightSource: "prior" });
    expect(recs[0].coverage).toBe("128 of 320 accounts (40%)");
    expect(recs[1].coverage).toBe("not yet collected"); // monitor signal, null coverage
  });

  it("passes the limit through + flips the weighting copy when learned", async () => {
    recommendSignals.mockResolvedValue({ totalAccounts: 10, outcomesLearned: 15, icpIndustries: [], recommendations: [] });
    const r = await run({ limit: 5 });
    expect(recommendSignals.mock.calls[0][1]).toEqual({ limit: 5 });
    expect(r.weighting).toContain("learned");
  });
});
