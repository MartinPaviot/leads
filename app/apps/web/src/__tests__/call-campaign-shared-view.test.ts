/**
 * GET /api/calls/campaign — shared-cockpit fallback.
 *
 * A member who hasn't created their own campaign must see the workspace's
 * running campaign (cockpit + the owner's queue), not the onboarding
 * wizard; a rep with their own campaign keeps it (own-first). Queue
 * resolution must follow the DISPLAYED campaign's owner, not the caller.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAuthContext, selectQueue, mockGetTodaysCallList } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  // FIFO of result sets, one per db.select() call
  selectQueue: [] as unknown[][],
  mockGetTodaysCallList: vi.fn(),
}));

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: mockGetAuthContext,
  withAuthRLS: vi.fn(async (handler: (ctx: unknown) => Promise<Response>) => {
    const ctx = await mockGetAuthContext();
    if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return handler(ctx);
  }),
}));

vi.mock("@/db", () => {
  const makeChain = (data: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    const chain: any = {};
    for (const m of ["from", "where", "orderBy", "limit", "groupBy"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(data).then(resolve, reject);
    return chain;
  };
  return {
    db: {
      select: vi.fn(() => makeChain(selectQueue.shift() ?? [])),
    },
  };
});

vi.mock("@/lib/voice/campaign", () => ({
  createCallCampaign: vi.fn(),
  updateCallCampaign: vi.fn(),
  generateDailyCallList: vi.fn(),
  getTodaysCallList: mockGetTodaysCallList,
  parseGoalPhrase: vi.fn(),
}));

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: vi.fn(async () => ({})),
  hasUsableIcp: vi.fn(() => true),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn(async () => undefined) },
}));

import { GET } from "@/app/api/calls/campaign/route";

const TENANT = "tenant-1";
const MARTIN = "user-martin";
const PAUL = "user-paul";
const martinCampaign = {
  id: "camp-1",
  tenantId: TENANT,
  ownerId: MARTIN,
  status: "active",
  name: "1000 calls",
  dailyQuota: 40,
};

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  mockGetTodaysCallList.mockResolvedValue([]);
});

describe("GET /api/calls/campaign shared-cockpit fallback", () => {
  it("member with no own campaign gets the workspace's active campaign and its owner's queue", async () => {
    mockGetAuthContext.mockResolvedValue({ tenantId: TENANT, appUserId: PAUL, userId: "auth-paul", role: "member" });
    selectQueue.push(
      [], // own-campaign lookup: Paul owns none
      [martinCampaign], // tenant fallback: Martin's running campaign
      [{ n: 120 }], // callableCount
    );

    const res = await GET();
    const body = await res.json();

    expect(body.campaign?.id).toBe("camp-1");
    expect(body.needsOnboarding).toBe(false);
    // queue resolved for the campaign OWNER, not the caller
    expect(mockGetTodaysCallList).toHaveBeenCalledWith(TENANT, expect.any(Date), MARTIN);
  });

  it("rep with their own campaign keeps it (own-first, no fallback)", async () => {
    mockGetAuthContext.mockResolvedValue({ tenantId: TENANT, appUserId: MARTIN, userId: "auth-martin", role: "admin" });
    selectQueue.push(
      [martinCampaign], // own-campaign lookup hits
      [{ n: 120 }], // callableCount
    );

    const res = await GET();
    const body = await res.json();

    expect(body.campaign?.id).toBe("camp-1");
    expect(mockGetTodaysCallList).toHaveBeenCalledWith(TENANT, expect.any(Date), MARTIN);
  });

  it("excludes prospects with no dialable phone from the queue (no number, no call)", async () => {
    mockGetAuthContext.mockResolvedValue({ tenantId: TENANT, appUserId: MARTIN, userId: "auth-martin", role: "admin" });
    const base = {
      targetId: "t", campaignId: "camp-1", status: "queued", attemptCount: 0,
      nextAttemptAt: null, lastOutcome: null, firstName: "A", lastName: "B",
      title: "CEO", companyId: null, score: 80, lastEnrichedAt: null, properties: {},
    };
    mockGetTodaysCallList.mockResolvedValue([
      { ...base, contactId: "c-nophone", phone: null },
      { ...base, contactId: "c-empty", phone: "   " },
      { ...base, contactId: "c-withphone", phone: "+41790000000" },
    ]);
    selectQueue.push([martinCampaign], [{ n: 120 }]); // own campaign hit, then callableCount

    const res = await GET();
    const body = await res.json();

    const ids = (body.calls as Array<{ contactId: string }>).map((c) => c.contactId);
    expect(ids).toEqual(["c-withphone"]);
  });

  it("no campaign anywhere in the tenant still onboards", async () => {
    mockGetAuthContext.mockResolvedValue({ tenantId: TENANT, appUserId: PAUL, userId: "auth-paul", role: "member" });
    selectQueue.push(
      [], // own
      [], // tenant fallback
      [{ n: 0 }], // callableCount
    );

    const res = await GET();
    const body = await res.json();

    expect(body.campaign).toBeNull();
    expect(body.needsOnboarding).toBe(true);
    expect(mockGetTodaysCallList).not.toHaveBeenCalled();
  });
});
