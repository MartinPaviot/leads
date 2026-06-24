import { describe, it, expect } from "vitest";
import { buildMetricSnapshot, DbAlertStore, evaluateTenantRegressions } from "../db-evaluate";
import { metricRollupSnapshot, regressionAlert } from "@/db/schema";
import type { RollupSnapshotRow } from "../../rollups/db-rollups";

/**
 * Spec 32 — the snapshot-history -> MetricSnapshot mapping and the DB alert glue.
 * The regression math + fire/dedup/resolve are tested in detect.test / alerts.test.
 */

const snap = (day: string, m: Record<string, number>): RollupSnapshotRow => ({ dimension: "campaign", scopeKey: "c1", day, metrics: m as unknown as RollupSnapshotRow["metrics"] });

describe("buildMetricSnapshot", () => {
  it("current = latest day; baseline = mean of the prior days", () => {
    const s = buildMetricSnapshot("c1", [
      snap("2026-06-22", { replyRate: 0.10, bounceRate: 0.01 }),
      snap("2026-06-23", { replyRate: 0.12, bounceRate: 0.01 }),
      snap("2026-06-24", { replyRate: 0.05, bounceRate: 0.06 }), // latest
    ]);
    expect(s.scope).toBe("c1");
    expect(s.current.replyRate).toBeCloseTo(0.05);
    expect(s.current.bounceRate).toBeCloseTo(0.06);
    expect(s.baseline.replyRate).toBeCloseTo(0.11); // (0.10+0.12)/2
    expect(s.baseline.bounceRate).toBeCloseTo(0.01);
  });

  it("leaves baseline undefined when there is only one day (no baseline)", () => {
    const s = buildMetricSnapshot("c1", [snap("2026-06-24", { replyRate: 0.1 })]);
    expect(s.current.replyRate).toBeCloseTo(0.1);
    expect(s.baseline.replyRate).toBeUndefined();
  });
});

// Minimal stub: select->from(table)->where[/limit] returns rows by table identity;
// insert/update are captured.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(opts: { snapshots?: RollupSnapshotRow[]; alertRows?: any[]; onInsert?: (v: any) => void; onUpdate?: () => void } = {}) {
  const rowsFor = (table: unknown) => (table === regressionAlert ? (opts.alertRows ?? []) : (opts.snapshots ?? []));
  return {
    select: () => {
      let tbl: unknown;
      const chain: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
        from: (t: unknown) => { tbl = t; return chain; },
        where: () => {
          const p: any = Promise.resolve(rowsFor(tbl)); // eslint-disable-line @typescript-eslint/no-explicit-any
          p.limit = () => Promise.resolve(rowsFor(tbl));
          return p;
        },
      };
      return chain;
    },
    insert: () => ({ values: (v: any) => ({ onConflictDoUpdate: async () => opts.onInsert?.(v) }) }), // eslint-disable-line @typescript-eslint/no-explicit-any
    update: () => ({ set: () => ({ where: async () => opts.onUpdate?.() }) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("DbAlertStore", () => {
  it("setActive upserts; setResolved updates", async () => {
    let inserted: Record<string, unknown> | null = null;
    let updated = false;
    const store = new DbAlertStore("t1", stubDb({ onInsert: (v) => (inserted = v), onUpdate: () => (updated = true) }));
    await store.setActive("c1:replyRate", { key: "c1:replyRate", scope: "c1", metric: "replyRate", current: 0.05, baseline: 0.11, magnitude: 0.5, cause: "content", route: "weekly" });
    expect(inserted).toMatchObject({ key: "c1:replyRate", tenantId: "t1", active: true });
    await store.setResolved("c1:replyRate");
    expect(updated).toBe(true);
  });
});

describe("evaluateTenantRegressions", () => {
  it("fires a regression when the latest day is materially worse than the baseline", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const snapshots = [
      snap("2026-06-22", { replyRate: 0.12, positiveRate: 0.05, bounceRate: 0.01, spamRate: 0 }),
      snap("2026-06-23", { replyRate: 0.12, positiveRate: 0.05, bounceRate: 0.01, spamRate: 0 }),
      snap("2026-06-24", { replyRate: 0.04, positiveRate: 0.05, bounceRate: 0.01, spamRate: 0 }), // replyRate -67%
    ];
    const events = await evaluateTenantRegressions("t1", { database: stubDb({ snapshots, alertRows: [], onInsert: (v) => inserts.push(v) }) });
    const firing = events.filter((e) => e.status === "firing");
    expect(firing.some((e) => e.alert.metric === "replyRate")).toBe(true);
    expect(inserts.some((i) => i.metric === "replyRate")).toBe(true);
  });

  it("skips a campaign with only one day (no baseline)", async () => {
    const events = await evaluateTenantRegressions("t1", { database: stubDb({ snapshots: [snap("2026-06-24", { replyRate: 0.04 })] }) });
    expect(events).toEqual([]);
  });
});
