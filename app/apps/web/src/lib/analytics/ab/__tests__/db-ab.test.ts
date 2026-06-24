import { describe, it, expect } from "vitest";
import { campaignToVariant, compareCampaigns } from "../db-ab";
import type { OutboundRollupRow } from "../../rollups/db-rollups";
import type { Metrics } from "../../rollups/rollup";

// Stub db mirroring db-rollups.test: computeCampaignRollups reads
// select->from->leftJoin->where over outbound. The stub ignores the date/tenant
// filter and returns the supplied rows; grouping by campaignId is done in the
// pure rowsToMetricEvents, so concatenated rows for two campaigns split cleanly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(outboundRows: any[]) {
  return {
    select: () => {
      const chain: any = {
        from: () => chain,
        leftJoin: () => chain,
        where: () => Promise.resolve(outboundRows),
      };
      return chain;
    },
  } as any;
}

const row = (over: Partial<OutboundRollupRow>): OutboundRollupRow => ({
  id: "o1", campaignId: null, sequenceId: null, stepNumber: 1,
  sentAt: null, deliveredAt: null, repliedAt: null, replyClassification: null, bouncedAt: null, bounceType: null,
  ...over,
});

/** N outbound rows for a campaign: `positives` interested replies, `replies-positives` plain replies. */
function rowsFor(campaignId: string, o: { sent: number; replies: number; positives: number }) {
  const rows: OutboundRollupRow[] = [];
  for (let i = 0; i < o.sent; i++) {
    const isReply = i < o.replies;
    const isPositive = i < o.positives;
    rows.push(row({
      id: `${campaignId}-${i}`,
      campaignId,
      sentAt: new Date(1000),
      repliedAt: isReply ? new Date(2000) : null,
      replyClassification: isReply ? (isPositive ? "interested" : "objection_price") : null,
    }));
  }
  return rows;
}

describe("campaignToVariant", () => {
  it("maps a campaign's metrics onto the campaign axis", () => {
    const m = { sent: 120, replies: 30, positiveReplies: 9 } as Metrics;
    expect(campaignToVariant("c1", m)).toEqual({
      variantId: "c1", axis: "campaign", axisValue: "c1", sent: 120, replies: 30, positiveReplies: 9,
    });
  });

  it("zeroes an absent campaign (no sends) so it cannot win on thin data", () => {
    expect(campaignToVariant("c9", null)).toEqual({
      variantId: "c9", axis: "campaign", axisValue: "c9", sent: 0, replies: 0, positiveReplies: 0,
    });
  });
});

describe("compareCampaigns", () => {
  it("refuses to compare a campaign to itself", async () => {
    const res = await compareCampaigns("t1", "c1", "c1", { database: stubDb([]) });
    expect(res.verdict).toBe("inconclusive");
    expect(res.reason).toMatch(/itself/);
  });

  it("returns insufficient_data when either campaign is below the min sample", async () => {
    const rows = [...rowsFor("c1", { sent: 50, replies: 20, positives: 10 }), ...rowsFor("c2", { sent: 50, replies: 5, positives: 1 })];
    const res = await compareCampaigns("t1", "c1", "c2", { database: stubDb(rows) });
    expect(res.verdict).toBe("insufficient_data");
  });

  it("returns insufficient_data when one campaign has no sends at all", async () => {
    const rows = rowsFor("c1", { sent: 150, replies: 60, positives: 20 });
    const res = await compareCampaigns("t1", "c1", "missing", { database: stubDb(rows) });
    expect(res.verdict).toBe("insufficient_data");
  });

  it("declares the higher-rate campaign the winner when the gap is significant", async () => {
    const rows = [
      ...rowsFor("c1", { sent: 150, replies: 60, positives: 20 }), // 40% reply rate
      ...rowsFor("c2", { sent: 150, replies: 15, positives: 3 }),  // 10% reply rate
    ];
    const res = await compareCampaigns("t1", "c1", "c2", { database: stubDb(rows) });
    expect(res.verdict).toBe("winner");
    expect(res.winnerId).toBe("c1");
    expect(res.pValue).toBeLessThan(0.05);
  });

  it("returns no_significant_difference when the rates match", async () => {
    const rows = [
      ...rowsFor("c1", { sent: 120, replies: 12, positives: 4 }),
      ...rowsFor("c2", { sent: 120, replies: 12, positives: 4 }),
    ];
    const res = await compareCampaigns("t1", "c1", "c2", { database: stubDb(rows) });
    expect(res.verdict).toBe("no_significant_difference");
  });

  it("judges on the positive-reply metric when asked", async () => {
    const rows = [
      ...rowsFor("c1", { sent: 150, replies: 75, positives: 60 }), // 40% positive rate
      ...rowsFor("c2", { sent: 150, replies: 75, positives: 9 }),  // 6% positive rate
    ];
    const res = await compareCampaigns("t1", "c1", "c2", { database: stubDb(rows), metric: "positive" });
    expect(res.metric).toBe("positive");
    expect(res.verdict).toBe("winner");
    expect(res.winnerId).toBe("c1");
  });
});
