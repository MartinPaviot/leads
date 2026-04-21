import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Covers the pure aggregation logic in `getOnboardingAgentLatency`:
 * percentile computation, grouping by agent, error-rate ratio, cost
 * sum. The `db` layer is stubbed to return canned rows so percentiles
 * are deterministic.
 */

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => selectMock(),
  },
}));

vi.mock("@/db/schema", () => ({
  agentTraces: {
    tenantId: "tenant_id",
    agentId: "agent_id",
    status: "status",
    latencyMs: "latency_ms",
    estimatedCost: "estimated_cost",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  gte: (...args: unknown[]) => ({ gte: args }),
  lte: (...args: unknown[]) => ({ lte: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
}));

const queriesModule = await import("@/lib/observability-queries");

type Row = {
  agentId: string;
  status: "ok" | "error" | "timeout" | "corrected";
  latencyMs: number | null;
  estimatedCost: number | null;
};

function stubRows(rows: Row[]) {
  // Mimic the Drizzle chain `db.select(...).from(...).where(...)`
  // returning a Promise<Row[]>. The real chain awaits the final
  // `where` call, so our stub is Promise-shaped at that leaf.
  selectMock.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  });
}

beforeEach(() => {
  selectMock.mockReset();
});

describe("getOnboardingAgentLatency", () => {
  it("returns an empty array when no rows match the window", async () => {
    stubRows([]);
    const out = await queriesModule.getOnboardingAgentLatency({
      since: new Date("2026-04-18T00:00:00Z"),
    });
    expect(out).toEqual([]);
  });

  it("groups by agentId and computes p50/p95/p99 and error rate", async () => {
    // 10 rows for icp-analysis, 1 error; 5 rows for build-tam, no errors.
    // Latencies chosen so percentiles are easy to verify by inspection.
    const icp: Row[] = Array.from({ length: 10 }, (_, i) => ({
      agentId: "icp-analysis",
      status: (i === 0 ? "error" : "ok") as Row["status"],
      latencyMs: (i + 1) * 1000, // 1000, 2000, ..., 10000
      estimatedCost: 0.05,
    }));
    const tam: Row[] = Array.from({ length: 5 }, (_, i) => ({
      agentId: "build-tam",
      status: "ok" as Row["status"],
      latencyMs: (i + 1) * 2000, // 2000, 4000, 6000, 8000, 10000
      estimatedCost: 0.02,
    }));
    stubRows([...icp, ...tam]);

    const out = await queriesModule.getOnboardingAgentLatency({
      since: new Date("2026-04-18T00:00:00Z"),
    });
    expect(out).toHaveLength(2);

    const build = out.find((r) => r.agentId === "build-tam")!;
    const icpRow = out.find((r) => r.agentId === "icp-analysis")!;

    // 10 latencies sorted: 1000..10000. floor(10*0.5)=5 → index 5 → 6000.
    expect(icpRow.p50LatencyMs).toBe(6000);
    // floor(10*0.95)=9 → index 9 → 10000.
    expect(icpRow.p95LatencyMs).toBe(10000);
    expect(icpRow.p99LatencyMs).toBe(10000);
    expect(icpRow.totalCalls).toBe(10);
    expect(icpRow.errorCount).toBe(1);
    expect(icpRow.errorRate).toBeCloseTo(0.1, 5);
    expect(icpRow.totalCostUsd).toBeCloseTo(0.5, 5);
    expect(icpRow.avgCostUsd).toBeCloseTo(0.05, 5);

    // 5 latencies sorted: 2000, 4000, 6000, 8000, 10000. floor(5*0.5)=2 → 6000.
    expect(build.p50LatencyMs).toBe(6000);
    expect(build.p95LatencyMs).toBe(10000);
    expect(build.totalCalls).toBe(5);
    expect(build.errorCount).toBe(0);
    expect(build.errorRate).toBe(0);
  });

  it("treats timeout as an error for errorRate purposes", async () => {
    const rows: Row[] = [
      { agentId: "build-tam", status: "ok", latencyMs: 1000, estimatedCost: 0.02 },
      { agentId: "build-tam", status: "timeout", latencyMs: 30000, estimatedCost: 0 },
      { agentId: "build-tam", status: "error", latencyMs: 500, estimatedCost: 0 },
    ];
    stubRows(rows);

    const out = await queriesModule.getOnboardingAgentLatency({
      since: new Date("2026-04-18T00:00:00Z"),
    });
    const tam = out[0];
    expect(tam.errorCount).toBe(2);
    expect(tam.errorRate).toBeCloseTo(2 / 3, 5);
  });

  it("skips rows with null latency from the percentile computation", async () => {
    const rows: Row[] = [
      { agentId: "icp-analysis", status: "ok", latencyMs: null, estimatedCost: 0 },
      { agentId: "icp-analysis", status: "ok", latencyMs: 500, estimatedCost: 0 },
      { agentId: "icp-analysis", status: "ok", latencyMs: 1500, estimatedCost: 0 },
    ];
    stubRows(rows);

    const out = await queriesModule.getOnboardingAgentLatency({
      since: new Date("2026-04-18T00:00:00Z"),
    });
    const r = out[0];
    // Sorted non-nulls: 500, 1500. floor(2*0.5)=1 → 1500.
    expect(r.p50LatencyMs).toBe(1500);
    // totalCalls should still include the null row — it's a real call,
    // just missing latency data.
    expect(r.totalCalls).toBe(3);
  });

  it("returns stable agent ordering (alphabetical)", async () => {
    const rows: Row[] = [
      { agentId: "onboarding-narrator", status: "ok", latencyMs: 100, estimatedCost: 0 },
      { agentId: "build-tam", status: "ok", latencyMs: 200, estimatedCost: 0 },
      { agentId: "icp-analysis", status: "ok", latencyMs: 300, estimatedCost: 0 },
    ];
    stubRows(rows);

    const out = await queriesModule.getOnboardingAgentLatency({
      since: new Date("2026-04-18T00:00:00Z"),
    });
    expect(out.map((r) => r.agentId)).toEqual([
      "build-tam",
      "icp-analysis",
      "onboarding-narrator",
    ]);
  });
});

describe("ONBOARDING_AGENT_IDS catalog", () => {
  it("contains the three onboarding critical-path agents", () => {
    expect(queriesModule.ONBOARDING_AGENT_IDS).toEqual([
      "icp-analysis",
      "build-tam",
      "onboarding-narrator",
    ]);
  });
});
