import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the database layer before importing the module under test.
// The real-time detector queries `activities`, `contacts`, `companies`,
// `users`, and `notifications` tables. We intercept all DB calls so tests
// run without a live database.
// ---------------------------------------------------------------------------

// Default chain: select().from().where().orderBy().limit()
// Make every method in the chain return the same thenable object so
// the promise resolves regardless of which method is called last.
function buildSelectChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = vi.fn(self);
  chain.where = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.orderBy = vi.fn(self);
  // Make the chain thenable so `await db.select().from().where()` works
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

function buildInsertChain() {
  return {
    values: vi.fn().mockReturnValue({
      then: (resolve: (v: unknown) => void) => resolve(undefined),
      returning: vi.fn().mockResolvedValue([]),
    }),
  };
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  activities: { id: "id", tenantId: "tenant_id", entityId: "entity_id", entityType: "entity_type", direction: "direction", occurredAt: "occurred_at", sentiment: "sentiment", threadId: "thread_id", rawContent: "raw_content", summary: "summary", metadata: "metadata", activityType: "activity_type", channel: "channel" },
  contacts: { id: "id", tenantId: "tenant_id", companyId: "company_id", title: "title", email: "email" },
  companies: { id: "id", tenantId: "tenant_id", properties: "properties" },
  deals: { id: "id", tenantId: "tenant_id", stage: "stage" },
  notifications: { id: "id", tenantId: "tenant_id", userId: "user_id", type: "type", title: "title", body: "body", entityType: "entity_type", entityId: "entity_id" },
  users: { id: "id", tenantId: "tenant_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  gte: vi.fn((...args: unknown[]) => ({ type: "gte", args })),
  desc: vi.fn((col: unknown) => ({ type: "desc", col })),
  sql: vi.fn(),
  notInArray: vi.fn((...args: unknown[]) => ({ type: "notInArray", args })),
}));

import { db } from "@/db";
import {
  evaluateSignalsRealTime,
  detectChampionEmergence,
  detectEngagementVelocity,
  detectExpansionSignals,
  DEFAULT_COMPETITOR_KEYWORDS,
  HIRING_ROLE_KEYWORDS,
  RISK_KEYWORDS,
  type SignalTriggerEvent,
} from "@/lib/signals/real-time-detector";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockDbSelect(results: unknown[]) {
  const chain = buildSelectChain(results);
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function mockDbSelectSequence(resultSets: unknown[][]) {
  let callIdx = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const results = resultSets[callIdx] || [];
    callIdx++;
    return buildSelectChain(results);
  });
}

function mockDbInsert() {
  const chain = buildInsertChain();
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("evaluateSignalsRealTime", () => {

  // -----------------------------------------------------------------------
  // 1. Email: competitor mention detection
  // -----------------------------------------------------------------------
  it("detects competitor mentions in email content", async () => {
    // DB call 1: load activity
    // DB call 2: notifications - load users
    // DB call 3: notifications - insert
    mockDbSelectSequence([
      // Activity lookup
      [{
        id: "act-1",
        tenantId: "t-1",
        entityId: "contact-1",
        entityType: "contact",
        direction: "inbound",
        rawContent: "We are currently evaluating HubSpot and Salesforce for our CRM needs.",
        summary: "CRM evaluation",
        sentiment: "neutral",
        threadId: "thread-1",
        occurredAt: new Date(),
        metadata: {},
      }],
      // Champion check: recent positive activities
      [],
      // Velocity: last outbound in thread
      [],
      // Notification: tenant users
      [{ id: "user-1" }],
    ]);
    mockDbInsert();

    const event: SignalTriggerEvent = {
      type: "email_synced",
      tenantId: "t-1",
      activityId: "act-1",
      contactId: "contact-1",
    };

    const result = await evaluateSignalsRealTime(event);

    expect(result.signalsDetected.length).toBeGreaterThanOrEqual(1);
    const competitorSignal = result.signalsDetected.find(
      (s) => s.type === "competitor_mention",
    );
    expect(competitorSignal).toBeDefined();
    expect(competitorSignal!.detail).toContain("hubspot");
    expect(competitorSignal!.detail).toContain("salesforce");
    expect(competitorSignal!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  // -----------------------------------------------------------------------
  // 2. Email: risk keywords in inbound email
  // -----------------------------------------------------------------------
  it("detects risk signals from negative inbound email content", async () => {
    mockDbSelectSequence([
      [{
        id: "act-2",
        tenantId: "t-1",
        entityId: "contact-2",
        entityType: "contact",
        direction: "inbound",
        rawContent: "We have decided to cancel our evaluation and are not interested anymore.",
        summary: "Cancellation",
        sentiment: "negative",
        threadId: null,
        occurredAt: new Date(),
        metadata: {},
      }],
      // Champion check
      [],
      // Users for notifications
      [{ id: "user-1" }],
    ]);
    mockDbInsert();

    const result = await evaluateSignalsRealTime({
      type: "email_synced",
      tenantId: "t-1",
      activityId: "act-2",
      contactId: "contact-2",
    });

    const riskSignal = result.signalsDetected.find(
      (s) => s.type === "risk_negative_reply",
    );
    expect(riskSignal).toBeDefined();
    expect(riskSignal!.detail).toContain("cancel");
    expect(riskSignal!.detail).toContain("not interested");

    // Also should detect negative sentiment
    const sentimentSignal = result.signalsDetected.find(
      (s) => s.type === "risk_negative_sentiment",
    );
    expect(sentimentSignal).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 3. Email: no signals on benign email
  // -----------------------------------------------------------------------
  it("returns no signals for a benign outbound email", async () => {
    mockDbSelectSequence([
      [{
        id: "act-3",
        tenantId: "t-1",
        entityId: "contact-3",
        entityType: "contact",
        direction: "outbound",
        rawContent: "Hi, just following up on our conversation from last week.",
        summary: "Follow up",
        sentiment: "neutral",
        threadId: null,
        occurredAt: new Date(),
        metadata: {},
      }],
    ]);

    const result = await evaluateSignalsRealTime({
      type: "email_synced",
      tenantId: "t-1",
      activityId: "act-3",
    });

    expect(result.signalsDetected).toHaveLength(0);
    expect(result.notificationsSent).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 4. Email: activity not found
  // -----------------------------------------------------------------------
  it("returns empty result when activity is not found", async () => {
    mockDbSelectSequence([[]]);

    const result = await evaluateSignalsRealTime({
      type: "email_synced",
      tenantId: "t-1",
      activityId: "nonexistent",
    });

    expect(result.signalsDetected).toHaveLength(0);
    expect(result.notificationsSent).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 5. Meeting: competitor mentions and multi-stakeholder
  // -----------------------------------------------------------------------
  it("detects competitor mentions and multi-stakeholder engagement in meetings", async () => {
    mockDbSelectSequence([
      [{
        id: "meeting-1",
        tenantId: "t-1",
        entityId: "deal-1",
        entityType: "deal",
        direction: "outbound",
        rawContent: "Discussion about moving away from Pipedrive. They want better automation.",
        summary: "Product demo with 4 stakeholders",
        sentiment: "positive",
        occurredAt: new Date(),
        metadata: {
          attendees: [
            { email: "a@co.com", contactId: "c1" },
            { email: "b@co.com", contactId: "c2" },
            { email: "c@co.com", contactId: "c3" },
            { email: "d@co.com", contactId: "c4" },
          ],
        },
      }],
      // Users for notifications
      [{ id: "user-1" }],
    ]);
    mockDbInsert();

    const result = await evaluateSignalsRealTime({
      type: "meeting_completed",
      tenantId: "t-1",
      activityId: "meeting-1",
      dealId: "deal-1",
    });

    expect(result.signalsDetected.length).toBeGreaterThanOrEqual(2);

    const competitor = result.signalsDetected.find((s) => s.type === "competitor_mention");
    expect(competitor).toBeDefined();
    expect(competitor!.detail).toContain("pipedrive");

    const multiStakeholder = result.signalsDetected.find(
      (s) => s.type === "multi_stakeholder_meeting",
    );
    expect(multiStakeholder).toBeDefined();
    expect(multiStakeholder!.detail).toContain("4 attendees");

    const positive = result.signalsDetected.find((s) => s.type === "positive_meeting");
    expect(positive).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 6. Enrichment: funding and hiring signals
  // -----------------------------------------------------------------------
  it("detects funding and hiring signals from enrichment data", async () => {
    const enrichedAt = new Date().toISOString();
    mockDbSelectSequence([
      // Company lookup
      [{
        id: "comp-1",
        tenantId: "t-1",
        properties: {
          latest_funding_stage: "series_b",
          total_funding_printed: "$25M",
          enriched_at: enrichedAt,
          jobPostingIntent: {
            signalStrength: "high",
            roles: ["Head of Sales", "Senior Account Executive", "Frontend Developer"],
            detectedAt: new Date().toISOString(),
          },
        },
      }],
      // Users for notifications
      [{ id: "user-1" }],
    ]);
    mockDbInsert();

    const result = await evaluateSignalsRealTime({
      type: "enrichment_completed",
      tenantId: "t-1",
      companyId: "comp-1",
    });

    expect(result.signalsDetected.length).toBeGreaterThanOrEqual(2);

    const funding = result.signalsDetected.find((s) => s.type === "funding_detected");
    expect(funding).toBeDefined();
    expect(funding!.detail).toContain("series_b");
    expect(funding!.confidence).toBe(0.8);

    const hiring = result.signalsDetected.find((s) => s.type === "hiring_signal");
    expect(hiring).toBeDefined();
    expect(hiring!.detail).toContain("Head of Sales");
    expect(hiring!.confidence).toBe(0.85); // high signal strength
  });

  // -----------------------------------------------------------------------
  // 7. Enrichment: tech stack change
  // -----------------------------------------------------------------------
  it("detects tech stack changes from enrichment data", async () => {
    mockDbSelectSequence([
      [{
        id: "comp-2",
        tenantId: "t-1",
        properties: {
          techStackChange: {
            detectedAt: new Date().toISOString(),
            added: ["Segment", "Amplitude"],
            removed: ["Mixpanel"],
          },
        },
      }],
      // Users for notifications
      [{ id: "user-1" }],
    ]);
    mockDbInsert();

    const result = await evaluateSignalsRealTime({
      type: "enrichment_completed",
      tenantId: "t-1",
      companyId: "comp-2",
    });

    const techChange = result.signalsDetected.find(
      (s) => s.type === "tech_stack_change",
    );
    expect(techChange).toBeDefined();
    expect(techChange!.detail).toContain("Segment");
    expect(techChange!.detail).toContain("Amplitude");
    expect(techChange!.detail).toContain("Mixpanel");
    expect(techChange!.confidence).toBe(0.7);
  });

  // -----------------------------------------------------------------------
  // 8. Deal stage: progression and regression
  // -----------------------------------------------------------------------
  it("detects deal progression when stage advances", async () => {
    // Deal stage changes don't need DB lookups for the basic detection
    mockDbSelectSequence([
      // Users for notification
      [{ id: "user-1" }],
    ]);
    mockDbInsert();

    const result = await evaluateSignalsRealTime({
      type: "deal_stage_changed",
      tenantId: "t-1",
      dealId: "deal-1",
      fromStage: "qualified",
      toStage: "demo",
    });

    const progression = result.signalsDetected.find(
      (s) => s.type === "deal_progression",
    );
    expect(progression).toBeDefined();
    expect(progression!.confidence).toBe(0.9);
    expect(progression!.detail).toContain("qualified");
    expect(progression!.detail).toContain("demo");
  });

  it("detects deal regression when stage moves backward", async () => {
    mockDbSelectSequence([
      [{ id: "user-1" }],
    ]);
    mockDbInsert();

    const result = await evaluateSignalsRealTime({
      type: "deal_stage_changed",
      tenantId: "t-1",
      dealId: "deal-2",
      fromStage: "proposal",
      toStage: "qualified",
    });

    const regression = result.signalsDetected.find(
      (s) => s.type === "deal_regression",
    );
    expect(regression).toBeDefined();
    expect(regression!.confidence).toBe(0.8);
    expect(regression!.detail).toContain("proposal");
    expect(regression!.detail).toContain("qualified");
  });

  it("detects deal won and deal lost", async () => {
    mockDbSelectSequence([[{ id: "user-1" }]]);
    mockDbInsert();
    const wonResult = await evaluateSignalsRealTime({
      type: "deal_stage_changed",
      tenantId: "t-1",
      dealId: "deal-3",
      fromStage: "negotiation",
      toStage: "won",
    });
    const wonSignal = wonResult.signalsDetected.find((s) => s.type === "deal_won");
    expect(wonSignal).toBeDefined();
    expect(wonSignal!.confidence).toBe(1.0);

    vi.clearAllMocks();
    mockDbSelectSequence([[{ id: "user-1" }]]);
    mockDbInsert();
    const lostResult = await evaluateSignalsRealTime({
      type: "deal_stage_changed",
      tenantId: "t-1",
      dealId: "deal-4",
      fromStage: "demo",
      toStage: "lost",
    });
    const lostSignal = lostResult.signalsDetected.find((s) => s.type === "deal_lost");
    expect(lostSignal).toBeDefined();
    expect(lostSignal!.confidence).toBe(1.0);
  });

  // -----------------------------------------------------------------------
  // 9. Enrichment: company not found
  // -----------------------------------------------------------------------
  it("returns empty signals when enrichment company is not found", async () => {
    mockDbSelectSequence([[]]);

    const result = await evaluateSignalsRealTime({
      type: "enrichment_completed",
      tenantId: "t-1",
      companyId: "nonexistent",
    });

    expect(result.signalsDetected).toHaveLength(0);
    expect(result.notificationsSent).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 10. Enrichment: stale enrichment data doesn't trigger funding signal
  // -----------------------------------------------------------------------
  it("does not fire funding signal for stale enrichment data (>7 days)", async () => {
    const oldDate = new Date(Date.now() - 10 * 86_400_000).toISOString();
    mockDbSelectSequence([
      [{
        id: "comp-3",
        tenantId: "t-1",
        properties: {
          latest_funding_stage: "series_a",
          total_funding_printed: "$5M",
          enriched_at: oldDate,
        },
      }],
    ]);

    const result = await evaluateSignalsRealTime({
      type: "enrichment_completed",
      tenantId: "t-1",
      companyId: "comp-3",
    });

    const funding = result.signalsDetected.find(
      (s) => s.type === "funding_detected",
    );
    expect(funding).toBeUndefined();
  });
});

// ===========================================================================
// Unit tests for individual detectors
// ===========================================================================

describe("detectChampionEmergence", () => {
  it("returns champion signal when 3+ positive inbound interactions in 14 days", async () => {
    mockDbSelectSequence([
      [
        { id: "a1", sentiment: "positive" },
        { id: "a2", sentiment: "positive" },
        { id: "a3", sentiment: "positive" },
        { id: "a4", sentiment: "neutral" },
      ],
    ]);

    const signals = await detectChampionEmergence("t-1", "contact-1");

    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("champion_emergence");
    expect(signals[0].detail).toContain("3 positive");
    expect(signals[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("returns no signal when fewer than 3 positive interactions", async () => {
    mockDbSelectSequence([
      [
        { id: "a1", sentiment: "positive" },
        { id: "a2", sentiment: "positive" },
        { id: "a3", sentiment: "neutral" },
      ],
    ]);

    const signals = await detectChampionEmergence("t-1", "contact-1");
    expect(signals).toHaveLength(0);
  });
});

describe("detectEngagementVelocity", () => {
  it("detects fast response (under 2 hours)", async () => {
    const outboundTime = new Date(Date.now() - 45 * 60_000); // 45 min ago
    mockDbSelectSequence([
      [{ occurredAt: outboundTime }],
    ]);

    const signals = await detectEngagementVelocity(
      "t-1",
      "contact-1",
      "thread-1",
      new Date(), // reply just now
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("fast_response");
    expect(signals[0].detail).toContain("minutes");
    expect(signals[0].confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("does not fire for slow responses (>2 hours)", async () => {
    const outboundTime = new Date(Date.now() - 5 * 3_600_000); // 5 hours ago
    mockDbSelectSequence([
      [{ occurredAt: outboundTime }],
    ]);

    const signals = await detectEngagementVelocity(
      "t-1",
      "contact-1",
      "thread-1",
      new Date(),
    );

    expect(signals).toHaveLength(0);
  });

  it("returns empty when no prior outbound in thread", async () => {
    mockDbSelectSequence([[]]);

    const signals = await detectEngagementVelocity(
      "t-1",
      "contact-1",
      "thread-1",
      new Date(),
    );

    expect(signals).toHaveLength(0);
  });
});

describe("detectExpansionSignals", () => {
  it("detects multi-department engagement", async () => {
    mockDbSelectSequence([
      // Contacts at company
      [
        { id: "c1", title: "Head of Sales" },
        { id: "c2", title: "CTO" },
        { id: "c3", title: "Product Manager" },
      ],
      // Recent inbound activities
      [
        { entityId: "c1" },
        { entityId: "c2" },
        { entityId: "c3" },
      ],
    ]);

    const signals = await detectExpansionSignals("t-1", "comp-1");

    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("expansion_multi_department");
    expect(signals[0].detail).toContain("3 departments");
    expect(signals[0].detail).toContain("3 active contacts");
  });

  it("does not fire when fewer than 2 contacts at company", async () => {
    mockDbSelectSequence([
      [{ id: "c1", title: "CEO" }],
    ]);

    const signals = await detectExpansionSignals("t-1", "comp-1");
    expect(signals).toHaveLength(0);
  });
});

// ===========================================================================
// Exported constant sanity checks
// ===========================================================================

describe("exported constants", () => {
  it("DEFAULT_COMPETITOR_KEYWORDS is non-empty and lowercase-safe", () => {
    expect(DEFAULT_COMPETITOR_KEYWORDS.length).toBeGreaterThan(5);
    for (const kw of DEFAULT_COMPETITOR_KEYWORDS) {
      expect(kw).toBe(kw.toLowerCase());
    }
  });

  it("HIRING_ROLE_KEYWORDS contains sales-related terms", () => {
    expect(HIRING_ROLE_KEYWORDS).toContain("sales");
    expect(HIRING_ROLE_KEYWORDS).toContain("sdr");
    expect(HIRING_ROLE_KEYWORDS).toContain("revenue");
  });

  it("RISK_KEYWORDS contains disengagement terms", () => {
    expect(RISK_KEYWORDS).toContain("cancel");
    expect(RISK_KEYWORDS).toContain("not interested");
    expect(RISK_KEYWORDS).toContain("budget cut");
  });
});
