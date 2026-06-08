import { describe, it, expect, vi, beforeEach } from "vitest";

// updateCallCampaign is DB-bound; we mock @/db so the SELECT returns a known
// existing campaign and the UPDATE captures the exact patch written. That lets
// us assert the recompute + merge logic (quota, weeklyTarget, name refresh,
// targetFilter merge) without a live database.

let existingRow: Record<string, unknown> | null = null;
let capturedPatch: Record<string, unknown> | null = null;

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (existingRow ? [existingRow] : []),
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        capturedPatch = patch;
        return {
          where: () => ({
            returning: async () => (existingRow ? [{ ...existingRow, ...patch }] : []),
          }),
        };
      },
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  callCampaigns: { id: "id", tenantId: "tenant_id", targetFilter: "target_filter" },
  callCampaignTargets: {},
  contacts: {},
  doNotCallList: {},
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  lte: (...a: unknown[]) => a,
  sql: (...a: unknown[]) => a,
  desc: (...a: unknown[]) => a,
  isNull: (...a: unknown[]) => a,
  inArray: (...a: unknown[]) => a,
}));

// parseGoalPhrase's AI deps are imported at module load but unused by
// updateCallCampaign — stub them so the import doesn't reach a real provider.
vi.mock("@/lib/ai/traced-ai", () => ({ tracedGenerateObject: vi.fn() }));
vi.mock("@/lib/ai/ai-provider", () => ({ anthropic: vi.fn() }));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn() }));

import { updateCallCampaign, dailyCallsForGoal, type GoalSpec } from "@/lib/voice/campaign";

const baseCampaign = () => ({
  id: "camp-1",
  tenantId: "tenant-1",
  name: "1000 calls this week",
  status: "active",
  weeklyTarget: 1000,
  daysPerWeek: 5,
  dailyQuota: 200,
  maxAttempts: 8,
  windowDays: 15,
  targetFilter: {
    goal: { type: "calls", target: 1000, window: "week", daysPerWeek: 5 },
    listFrequency: "daily",
    workingDays: [1, 2, 3, 4, 5],
    custom: "keep-me",
  },
});

describe("updateCallCampaign", () => {
  beforeEach(() => {
    existingRow = baseCampaign();
    capturedPatch = null;
  });

  it("returns null when the campaign doesn't exist", async () => {
    existingRow = null;
    const res = await updateCallCampaign({ tenantId: "tenant-1", campaignId: "nope" });
    expect(res).toBeNull();
    expect(capturedPatch).toBeNull();
  });

  it("recomputes the daily quota + weekly target when the goal changes", async () => {
    const goal: GoalSpec = { type: "meetings", target: 10, window: "month", daysPerWeek: 3 };
    await updateCallCampaign({ tenantId: "tenant-1", campaignId: "camp-1", goal });

    expect(capturedPatch).not.toBeNull();
    expect(capturedPatch!.dailyQuota).toBe(dailyCallsForGoal(goal));
    expect(capturedPatch!.daysPerWeek).toBe(3);
    // non-"calls/week" goals derive the weekly figure from the daily plan
    expect(capturedPatch!.weeklyTarget).toBe(dailyCallsForGoal(goal) * 3);
  });

  it("refreshes the auto name on a goal change but keeps an explicit name", async () => {
    const goal: GoalSpec = { type: "meetings", target: 10, window: "month" };
    await updateCallCampaign({ tenantId: "tenant-1", campaignId: "camp-1", goal });
    expect(capturedPatch!.name).toBe("10 meetings this month");

    capturedPatch = null;
    existingRow = baseCampaign();
    await updateCallCampaign({ tenantId: "tenant-1", campaignId: "camp-1", goal, name: "Q3 push" });
    expect(capturedPatch!.name).toBe("Q3 push");
  });

  it("merges targetFilter: overrides goal/listFrequency/workingDays, preserves other keys", async () => {
    const goal: GoalSpec = { type: "connects", target: 50, window: "week", daysPerWeek: 4 };
    await updateCallCampaign({
      tenantId: "tenant-1",
      campaignId: "camp-1",
      goal,
      listFrequency: "weekly",
      workingDays: [1, 3, 5],
    });

    const tf = capturedPatch!.targetFilter as Record<string, unknown>;
    expect(tf.goal).toEqual(goal);
    expect(tf.listFrequency).toBe("weekly");
    expect(tf.workingDays).toEqual([1, 3, 5]);
    expect(tf.custom).toBe("keep-me"); // untouched keys survive
  });

  it("updates cadence only, preserving the existing goal and name", async () => {
    await updateCallCampaign({ tenantId: "tenant-1", campaignId: "camp-1", maxAttempts: 12, windowDays: 30 });

    expect(capturedPatch!.maxAttempts).toBe(12);
    expect(capturedPatch!.windowDays).toBe(30);
    // no goal passed -> quota/name untouched, prior goal kept in the snapshot
    expect(capturedPatch!.dailyQuota).toBeUndefined();
    expect(capturedPatch!.name).toBeUndefined();
    const tf = capturedPatch!.targetFilter as Record<string, unknown>;
    expect(tf.goal).toEqual({ type: "calls", target: 1000, window: "week", daysPerWeek: 5 });
  });

  it("clamps cadence inputs to sane minimums", async () => {
    await updateCallCampaign({ tenantId: "tenant-1", campaignId: "camp-1", maxAttempts: 0, windowDays: -4 });
    expect(capturedPatch!.maxAttempts).toBe(1);
    expect(capturedPatch!.windowDays).toBe(1);
  });
});
