import { describe, it, expect } from "vitest";
import { rowsToMetricEvents, persistDailyRollups, getRollupSnapshots, type OutboundRollupRow } from "../db-rollups";
import { computeRollups } from "../rollup";

// Stub db: computeCampaignRollups uses select->from->leftJoin->where (outbound);
// getRollupSnapshots uses select->from->where (snapshots, no leftJoin). The
// insert path captures upserts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(opts: { outboundRows?: any[]; snapshotRows?: any[]; onUpsert?: (v: any) => void } = {}) {
  return {
    select: () => {
      let isOutbound = false;
      const chain: any = {
        from: () => chain,
        leftJoin: () => { isOutbound = true; return chain; },
        where: () => Promise.resolve(isOutbound ? (opts.outboundRows ?? []) : (opts.snapshotRows ?? [])),
      };
      return chain;
    },
    insert: () => ({ values: (v: any) => ({ onConflictDoUpdate: async () => { opts.onUpsert?.(v); } }) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/**
 * Spec 29 — the outbound_emails -> MetricEvent mapping (the live-schema seam).
 * The rollup math itself is tested in rollup.test; here we pin the event
 * derivation: dedup-stable ids, campaign key fallback, and reply/bounce typing.
 */

const row = (over: Partial<OutboundRollupRow>): OutboundRollupRow => ({
  id: "o1", campaignId: null, sequenceId: null, stepNumber: 1,
  sentAt: null, deliveredAt: null, repliedAt: null, replyClassification: null, bouncedAt: null, bounceType: null,
  ...over,
});

describe("rowsToMetricEvents", () => {
  it("emits sent/delivered/reply/bounce with stable per-id event ids", () => {
    const ev = rowsToMetricEvents([
      row({ id: "a", campaignId: "c1", sentAt: new Date(1000), deliveredAt: new Date(2000), repliedAt: new Date(3000), bouncedAt: null }),
    ]);
    expect(ev.map((e) => e.eventId).sort()).toEqual(["a:delivered", "a:reply", "a:sent"]);
    expect(ev.every((e) => e.campaignId === "c1")).toBe(true);
  });

  it("falls back campaignId -> sequenceId -> '(none)'", () => {
    expect(rowsToMetricEvents([row({ campaignId: null, sequenceId: "s9", sentAt: new Date(1) })])[0].campaignId).toBe("s9");
    expect(rowsToMetricEvents([row({ campaignId: null, sequenceId: null, sentAt: new Date(1) })])[0].campaignId).toBe("(none)");
  });

  it("classifies a positive reply vs a plain reply, and a complaint as spam", () => {
    const pos = rowsToMetricEvents([row({ repliedAt: new Date(1), replyClassification: "interested" })]);
    expect(pos[0].type).toBe("positive_reply");
    const plain = rowsToMetricEvents([row({ repliedAt: new Date(1), replyClassification: "objection_price" })]);
    expect(plain[0].type).toBe("reply");
    const spam = rowsToMetricEvents([row({ bouncedAt: new Date(1), bounceType: "complaint" })]);
    expect(spam[0].type).toBe("spam");
    const bounce = rowsToMetricEvents([row({ bouncedAt: new Date(1), bounceType: "permanent" })]);
    expect(bounce[0].type).toBe("bounce");
  });

  it("feeds computeRollups to produce per-campaign rates (idempotent on re-emit)", () => {
    const rows = [
      row({ id: "a", campaignId: "c1", sentAt: new Date(1), repliedAt: new Date(2), replyClassification: "interested" }),
      row({ id: "b", campaignId: "c1", sentAt: new Date(1), bouncedAt: new Date(2), bounceType: "permanent" }),
    ];
    const events = [...rowsToMetricEvents(rows), ...rowsToMetricEvents(rows)]; // duplicated -> dedup
    const result = computeRollups(events, { scope: { dimension: "campaign" } });
    const m = result.byScope["c1"];
    expect(m.sent).toBe(2);
    expect(m.replies).toBe(1);
    expect(m.positiveReplies).toBe(1);
    expect(m.bounces).toBe(1);
    expect(m.replyRate).toBeCloseTo(0.5);
    expect(m.bounceRate).toBeCloseTo(0.5);
  });
});

describe("persistDailyRollups", () => {
  it("upserts one snapshot row per campaign with the day + finalized metrics", async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const outboundRows = [
      row({ id: "a", campaignId: "c1", sentAt: new Date(1) }),
      row({ id: "b", campaignId: "c2", sentAt: new Date(1), repliedAt: new Date(2), replyClassification: "interested" }),
    ];
    const n = await persistDailyRollups("t1", "2026-06-24", { database: stubDb({ outboundRows, onUpsert: (v) => upserts.push(v) }) });
    expect(n).toBe(2);
    expect(upserts).toHaveLength(2);
    expect(upserts.map((u) => u.scopeKey).sort()).toEqual(["c1", "c2"]);
    expect(upserts.every((u) => u.dimension === "campaign" && u.day === "2026-06-24" && u.tenantId === "t1")).toBe(true);
    expect(upserts.every((u) => u.metrics && typeof u.metrics === "object")).toBe(true);
  });
});

describe("getRollupSnapshots", () => {
  it("returns persisted snapshot rows for the tenant", async () => {
    const snapshotRows = [{ dimension: "campaign", scopeKey: "c1", day: "2026-06-24", metrics: { sent: 3 } }];
    const out = await getRollupSnapshots("t1", { dimension: "campaign", sinceDay: "2026-06-01", database: stubDb({ snapshotRows }) });
    expect(out).toEqual(snapshotRows);
  });
});
