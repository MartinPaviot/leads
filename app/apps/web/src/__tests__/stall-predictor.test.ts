/**
 * Tests for stall-predictor.ts
 *
 * Tests time-in-stage calculation, activity drop detection,
 * one-sided email detection, upcoming meeting check,
 * and intervention generation through predictStalls
 * with mocked DB and buyer-intent scoring.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────

const { selectChainMock, scoreBuyerIntentMock } = vi.hoisted(() => ({
  selectChainMock: vi.fn(),
  scoreBuyerIntentMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => selectChainMock(),
  },
}));

vi.mock("@/db/schema", () => ({
  deals: {
    id: "id",
    tenantId: "tenant_id",
    name: "name",
    stage: "stage",
    value: "value",
    contactId: "contact_id",
    companyId: "company_id",
    properties: "properties",
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
  activities: {
    id: "id",
    tenantId: "tenant_id",
    entityType: "entity_type",
    entityId: "entity_id",
    activityType: "activity_type",
    direction: "direction",
    occurredAt: "occurred_at",
    metadata: "metadata",
    summary: "summary",
  },
  contacts: {
    id: "id",
    firstName: "first_name",
    lastName: "last_name",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  desc: (x: unknown) => ({ desc: x }),
  gte: (...args: unknown[]) => ({ gte: args }),
  notInArray: (...args: unknown[]) => ({ notInArray: args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...exprs: unknown[]) => ({
      sql: { strings, exprs },
    }),
    { join: (...a: unknown[]) => a },
  ),
}));

vi.mock("@/lib/scoring/buyer-intent", () => ({
  scoreBuyerIntent: (...args: unknown[]) => scoreBuyerIntentMock(...args),
}));

const { predictStalls } = await import("@/lib/analysis/stall-predictor");

// ── Test helpers ────────────────────────────────────────────────

/**
 * Thenable chain: every method returns self, `await` resolves to rows.
 */
function chainOf(rows: unknown[]): unknown {
  const self: Record<string, unknown> = {};
  for (const m of [
    "from",
    "where",
    "limit",
    "orderBy",
    "groupBy",
    "innerJoin",
    "leftJoin",
  ]) {
    self[m] = () => self;
  }
  self.then = (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(rows).then(resolve, reject);
  return self;
}

function setupDbCalls(overrides: {
  stageChanges?: unknown[];
  openDeals?: unknown[];
  dealActivities?: unknown[];
  meetings?: unknown[];
  contact?: Record<string, unknown> | null;
}) {
  let callIdx = 0;

  // Determine how many meeting check calls happen based on the deal's entityIds.
  // The deal ID is always checked; if it has a contactId, that's a second call.
  const firstDeal = (overrides.openDeals || [])[0] as
    | Record<string, unknown>
    | undefined;
  const meetingCallCount =
    firstDeal && firstDeal.contactId ? 2 : firstDeal ? 1 : 0;

  selectChainMock.mockImplementation(() => {
    callIdx++;
    // Calls 1-3 are always the same
    if (callIdx === 1) return chainOf(overrides.stageChanges || []);
    if (callIdx === 2) return chainOf(overrides.openDeals || []);
    if (callIdx === 3) return chainOf(overrides.dealActivities || []);

    // Calls 4..4+meetingCallCount-1 are meeting checks (one per entityId)
    if (callIdx <= 3 + meetingCallCount)
      return chainOf(overrides.meetings || []);

    // Next call after meetings is contact name lookup
    if (callIdx === 3 + meetingCallCount + 1)
      return chainOf(overrides.contact ? [overrides.contact] : []);

    return chainOf([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  scoreBuyerIntentMock.mockResolvedValue({
    score: 50,
    trend: "stable",
    signals: [],
    lastUpdated: new Date().toISOString(),
  });
});

// ── Time-in-Stage Calculation ───────────────────────────────────

describe("time-in-stage indicator", () => {
  it("flags deals exceeding P75 for their stage with high severity", async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Slow Deal",
          stage: "demo",
          value: 30000,
          contactId: "c1",
          companyId: "co1",
          properties: {},
          createdAt: sixtyDaysAgo,
          updatedAt: sixtyDaysAgo,
        },
      ],
      dealActivities: [
        {
          activityType: "email_sent",
          direction: "outbound",
          occurredAt: new Date(Date.now() - 5 * 86400000),
        },
        {
          activityType: "email_received",
          direction: "inbound",
          occurredAt: new Date(Date.now() - 2 * 86400000),
        },
      ],
      meetings: [{ id: "m1" }],
      contact: { firstName: "Sarah", lastName: "Chen" },
    });

    const predictions = await predictStalls("tenant-1");
    expect(predictions.length).toBe(1);
    const timeIndicator = predictions[0].indicators.find(
      (i) => i.type === "time_in_stage",
    );
    expect(timeIndicator).toBeDefined();
    expect(timeIndicator!.severity).toBe("high"); // 60 > 14*2 = 28
    // The indicator must carry concrete evidence — at least the
    // tenant benchmark line so the founder reads *why* without a
    // hover tooltip.
    expect(timeIndicator!.evidence).toBeDefined();
    expect(timeIndicator!.evidence!.length).toBeGreaterThan(0);
    expect(
      timeIndicator!.evidence!.some((line) =>
        line.toLowerCase().includes("benchmark"),
      ),
    ).toBe(true);
  });

  it("does not flag deals within normal stage duration", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Fresh Deal",
          stage: "demo",
          value: 30000,
          contactId: "c1",
          companyId: null,
          properties: {},
          createdAt: threeDaysAgo,
          updatedAt: threeDaysAgo,
        },
      ],
      dealActivities: [
        {
          activityType: "email_received",
          direction: "inbound",
          occurredAt: new Date(Date.now() - 1 * 86400000),
        },
        {
          activityType: "email_sent",
          direction: "outbound",
          occurredAt: new Date(Date.now() - 2 * 86400000),
        },
      ],
      meetings: [{ id: "m1" }],
    });

    const predictions = await predictStalls("tenant-1");
    if (predictions.length > 0) {
      const timeIndicator = predictions[0].indicators.find(
        (i) => i.type === "time_in_stage",
      );
      expect(timeIndicator).toBeUndefined();
    }
  });

  it("treats new deal with recent update as safe", async () => {
    const yesterday = new Date(Date.now() - 86400000);
    setupDbCalls({
      openDeals: [
        {
          id: "deal-new",
          name: "New Deal",
          stage: "lead",
          value: 5000,
          contactId: null,
          companyId: null,
          properties: {},
          createdAt: yesterday,
          updatedAt: yesterday,
        },
      ],
      dealActivities: [
        {
          activityType: "email_sent",
          direction: "outbound",
          occurredAt: yesterday,
        },
      ],
    });

    const predictions = await predictStalls("tenant-1");
    const timeIndicators = predictions.flatMap((p) =>
      p.indicators.filter((i) => i.type === "time_in_stage"),
    );
    expect(timeIndicators.length).toBe(0);
  });
});

// ── Activity Drop Detection ─────────────────────────────────────

describe("activity drop detection", () => {
  it("flags when activity drops by more than 50%", async () => {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);

    const previousActivities = Array.from({ length: 8 }, (_, i) => ({
      activityType: "email_sent",
      direction: "outbound",
      occurredAt: new Date(now - (15 + i) * 86400000),
    }));
    const recentActivity = {
      activityType: "email_received",
      direction: "inbound",
      occurredAt: new Date(now - 5 * 86400000),
    };

    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Dropping Deal",
          stage: "proposal",
          value: 20000,
          contactId: "c1",
          companyId: null,
          properties: {},
          createdAt: thirtyDaysAgo,
          updatedAt: thirtyDaysAgo,
        },
      ],
      dealActivities: [recentActivity, ...previousActivities],
      meetings: [{ id: "m1" }],
      contact: { firstName: "John", lastName: "Doe" },
    });

    const predictions = await predictStalls("tenant-1");
    expect(predictions.length).toBe(1);
    const dropIndicator = predictions[0].indicators.find(
      (i) => i.type === "activity_drop",
    );
    expect(dropIndicator).toBeDefined();
    // Audit-2026-05-08 — F17 mètis pin : evidence must surface the
    // recent vs prior counts so the founder reads the why.
    expect(dropIndicator!.evidence).toBeDefined();
    expect(dropIndicator!.evidence!.length).toBeGreaterThan(0);
    expect(
      dropIndicator!.evidence!.some((line) => /\d+ touch/.test(line)),
    ).toBe(true);
  });

  it("does not flag when activity is consistent", async () => {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);

    const activities = Array.from({ length: 10 }, (_, i) => ({
      activityType: "email_sent",
      direction: "outbound",
      occurredAt: new Date(now - i * 3 * 86400000),
    }));

    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Steady Deal",
          stage: "qualification",
          value: 15000,
          contactId: null,
          companyId: null,
          properties: {},
          createdAt: thirtyDaysAgo,
          updatedAt: new Date(now - 86400000),
        },
      ],
      dealActivities: activities,
      meetings: [{ id: "m1" }],
    });

    const predictions = await predictStalls("tenant-1");
    const dropIndicators = predictions.flatMap((p) =>
      p.indicators.filter((i) => i.type === "activity_drop"),
    );
    expect(dropIndicators.length).toBe(0);
  });
});

// ── One-Sided Email ─────────────────────────────────────────────

describe("one-sided email detection", () => {
  it("flags when last outbound has no reply for 5+ days", async () => {
    const now = Date.now();
    const twentyDaysAgo = new Date(now - 20 * 86400000);

    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "One-Sided Deal",
          stage: "proposal",
          value: 25000,
          contactId: "c1",
          companyId: null,
          properties: {},
          createdAt: twentyDaysAgo,
          updatedAt: twentyDaysAgo,
        },
      ],
      dealActivities: [
        {
          activityType: "email_sent",
          direction: "outbound",
          occurredAt: new Date(now - 7 * 86400000),
        },
        {
          activityType: "email_received",
          direction: "inbound",
          occurredAt: new Date(now - 15 * 86400000),
        },
      ],
      contact: { firstName: "Jane", lastName: "Smith" },
    });

    const predictions = await predictStalls("tenant-1");
    expect(predictions.length).toBe(1);
    const osIndicator = predictions[0].indicators.find(
      (i) => i.type === "one_sided_email",
    );
    expect(osIndicator).toBeDefined();
    // Audit-2026-05-08 — F17 mètis pin : the chip must reveal the
    // outbound/inbound asymmetry, not just the abstract type.
    expect(osIndicator!.evidence).toBeDefined();
    expect(osIndicator!.evidence!.length).toBeGreaterThan(0);
    expect(
      osIndicator!.evidence!.some((line) => /\d+ sent vs \d+ received/.test(line)),
    ).toBe(true);
  });

  it("does not flag when last email is inbound", async () => {
    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 86400000);

    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Replied Deal",
          stage: "demo",
          value: 10000,
          contactId: null,
          companyId: null,
          properties: {},
          createdAt: tenDaysAgo,
          updatedAt: new Date(now - 86400000),
        },
      ],
      dealActivities: [
        {
          activityType: "email_received",
          direction: "inbound",
          occurredAt: new Date(now - 1 * 86400000),
        },
        {
          activityType: "email_sent",
          direction: "outbound",
          occurredAt: new Date(now - 3 * 86400000),
        },
      ],
      meetings: [{ id: "m1" }],
    });

    const predictions = await predictStalls("tenant-1");
    const osIndicators = predictions.flatMap((p) =>
      p.indicators.filter((i) => i.type === "one_sided_email"),
    );
    expect(osIndicators.length).toBe(0);
  });
});

// ── No Upcoming Meeting ─────────────────────────────────────────

describe("no upcoming meeting indicator", () => {
  it("flags when no meeting scheduled and deal is 8+ days old", async () => {
    const now = Date.now();
    const twentyDaysAgo = new Date(now - 20 * 86400000);

    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "No Meeting Deal",
          stage: "qualification",
          value: 15000,
          contactId: "c1",
          companyId: null,
          properties: {},
          createdAt: twentyDaysAgo,
          updatedAt: twentyDaysAgo,
        },
      ],
      dealActivities: [
        {
          activityType: "email_received",
          direction: "inbound",
          occurredAt: new Date(now - 2 * 86400000),
        },
      ],
      meetings: [],
      contact: { firstName: "Bob", lastName: "Jones" },
    });

    const predictions = await predictStalls("tenant-1");
    const meetingIndicator = predictions.flatMap((p) =>
      p.indicators.filter((i) => i.type === "no_upcoming_meeting"),
    );
    expect(meetingIndicator.length).toBe(1);
  });

  it("does not flag when a meeting is scheduled", async () => {
    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 86400000);

    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Meeting Booked",
          stage: "demo",
          value: 20000,
          contactId: null,
          companyId: null,
          properties: {},
          createdAt: tenDaysAgo,
          updatedAt: tenDaysAgo,
        },
      ],
      dealActivities: [
        {
          activityType: "email_sent",
          direction: "outbound",
          occurredAt: new Date(now - 2 * 86400000),
        },
      ],
      meetings: [{ id: "m1" }],
    });

    const predictions = await predictStalls("tenant-1");
    const meetingIndicators = predictions.flatMap((p) =>
      p.indicators.filter((i) => i.type === "no_upcoming_meeting"),
    );
    expect(meetingIndicators.length).toBe(0);
  });
});

// ── Intervention Generation ─────────────────────────────────────

describe("intervention generation", () => {
  it("generates time-in-stage intervention for overdue deals", async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Overdue Deal",
          stage: "proposal",
          value: 50000,
          contactId: "c1",
          companyId: null,
          properties: {},
          createdAt: sixtyDaysAgo,
          updatedAt: sixtyDaysAgo,
        },
      ],
      dealActivities: [],
      meetings: [],
      contact: { firstName: "Alice", lastName: "Wong" },
    });

    const predictions = await predictStalls("tenant-1");
    expect(predictions.length).toBe(1);
    expect(predictions[0].suggestedInterventions.length).toBeGreaterThan(0);
    const intervention = predictions[0].suggestedInterventions[0];
    expect(intervention.action).toBeTruthy();
    expect(intervention.reasoning).toBeTruthy();
  });

  it("suggests re-engagement when activity drops", async () => {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);

    const oldActivities = Array.from({ length: 6 }, (_, i) => ({
      activityType: "email_sent",
      direction: "outbound",
      occurredAt: new Date(now - (16 + i) * 86400000),
    }));

    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Dropped Activity",
          stage: "trial",
          value: 40000,
          contactId: "c1",
          companyId: null,
          properties: {},
          createdAt: thirtyDaysAgo,
          updatedAt: thirtyDaysAgo,
        },
      ],
      dealActivities: oldActivities,
      meetings: [],
      contact: { firstName: "Mike", lastName: "Lee" },
    });

    const predictions = await predictStalls("tenant-1");
    expect(predictions.length).toBe(1);
    const interventions = predictions[0].suggestedInterventions;
    expect(interventions.length).toBeGreaterThanOrEqual(1);
    const hasReengagement = interventions.some(
      (i) =>
        i.action.includes("check-in") ||
        i.action.includes("re-engage") ||
        i.action.includes("follow-up") ||
        i.action.includes("Review deal") ||
        i.action.includes("Schedule"),
    );
    expect(hasReengagement).toBe(true);
  });

  it("caps interventions at 3 maximum", async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
    scoreBuyerIntentMock.mockResolvedValue({
      score: 20,
      trend: "cooling",
      signals: [],
      lastUpdated: new Date().toISOString(),
    });

    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Stalled Everything",
          stage: "proposal",
          value: 80000,
          contactId: "c1",
          companyId: null,
          properties: { nextSteps: ["Send revised proposal"] },
          createdAt: sixtyDaysAgo,
          updatedAt: sixtyDaysAgo,
        },
      ],
      dealActivities: [
        {
          activityType: "email_sent",
          direction: "outbound",
          occurredAt: new Date(Date.now() - 10 * 86400000),
        },
      ],
      meetings: [],
      contact: { firstName: "Test", lastName: "User" },
    });

    const predictions = await predictStalls("tenant-1");
    expect(predictions.length).toBe(1);
    expect(predictions[0].suggestedInterventions.length).toBeLessThanOrEqual(
      3,
    );
  });
});

// ── Empty Pipeline ──────────────────────────────────────────────

describe("edge cases", () => {
  it("returns empty array when no open deals exist", async () => {
    setupDbCalls({ openDeals: [] });
    const predictions = await predictStalls("tenant-1");
    expect(predictions).toEqual([]);
  });
});

// ── Audit-2026-05-08 — F17 mètis evidence pin ───────────────────
//
// Each indicator type that the founder sees on /opportunities/[id]
// must carry a non-empty `evidence` array : the chip is the *what*,
// the evidence list is the *why*. A future regression that drops
// the pass-through of underlying signal data (e.g. caching the
// indicator object before evidence is filled, or omitting the
// field on serialisation) would silently regress the UX back to
// hover-only tooltips. These tests fail loudly if it does.

describe("F17 audit pin — indicator.evidence is populated", () => {
  it("intent_cooling carries the top contributing buyer-intent signals", async () => {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);

    scoreBuyerIntentMock.mockResolvedValueOnce({
      score: 25,
      trend: "cooling",
      signals: [
        {
          type: "response_time",
          value: -0.4,
          weight: 0.3,
          evidence: "Response time slowed from <1h to 3 days",
        },
        {
          type: "email_length",
          value: -0.3,
          weight: 0.2,
          evidence: "Replies dropped from 250 chars to 60 chars",
        },
        {
          type: "after_hours",
          value: -0.1,
          weight: 0.1,
          evidence: "No after-hours engagement in 21 days",
        },
      ],
      lastUpdated: new Date().toISOString(),
    });

    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Cooling Deal",
          stage: "demo",
          value: 30000,
          contactId: "c1",
          companyId: null,
          properties: {},
          createdAt: thirtyDaysAgo,
          updatedAt: thirtyDaysAgo,
        },
      ],
      dealActivities: [
        {
          activityType: "email_received",
          direction: "inbound",
          occurredAt: new Date(now - 5 * 86400000),
        },
      ],
      meetings: [{ id: "m1" }],
      contact: { firstName: "Alex", lastName: "Reyes" },
    });

    const predictions = await predictStalls("tenant-1");
    const cool = predictions[0]?.indicators.find(
      (i) => i.type === "intent_cooling",
    );
    expect(cool).toBeDefined();
    // The scorer's per-signal evidence strings must be propagated up,
    // not aggregated away.
    expect(cool!.evidence).toBeDefined();
    expect(cool!.evidence!.length).toBeGreaterThan(0);
    expect(
      cool!.evidence!.some((line) => line.includes("Response time")),
    ).toBe(true);
  });

  it("no_recent_activity carries the last-activity date", async () => {
    const now = Date.now();
    const fortyFiveDaysAgo = new Date(now - 45 * 86400000);

    setupDbCalls({
      openDeals: [
        {
          id: "deal-1",
          name: "Forgotten Deal",
          stage: "qualification",
          value: 12000,
          contactId: null,
          companyId: null,
          properties: {},
          createdAt: fortyFiveDaysAgo,
          updatedAt: fortyFiveDaysAgo,
        },
      ],
      // Only one ancient activity → triggers no_recent_activity (>14d).
      dealActivities: [
        {
          activityType: "email_sent",
          direction: "outbound",
          occurredAt: new Date(now - 32 * 86400000),
        },
      ],
      meetings: [],
      contact: null,
    });

    const predictions = await predictStalls("tenant-1");
    const stale = predictions[0]?.indicators.find(
      (i) => i.type === "no_recent_activity",
    );
    expect(stale).toBeDefined();
    expect(stale!.evidence).toBeDefined();
    expect(stale!.evidence!.length).toBeGreaterThan(0);
    // The last-activity line should reference the activity type so
    // the founder knows what to follow up on.
    expect(
      stale!.evidence!.some((line) => /Last activity:/.test(line)),
    ).toBe(true);
  });
});
