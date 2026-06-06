/**
 * Tests for win-loss-engine.ts
 *
 * Tests engagement velocity, champion detection, competitor extraction,
 * objection handling, benchmark comparison, heuristic factors, and
 * full integration through analyzeWinLoss with mocked DB and LLM.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────

const { dbMock, tracedGenerateObjectMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
  tracedGenerateObjectMock: vi.fn(),
}));

vi.mock("@/db", () => ({ db: dbMock }));

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
  },
  activities: {
    id: "id",
    tenantId: "tenant_id",
    entityId: "entity_id",
    entityType: "entity_type",
    activityType: "activity_type",
    direction: "direction",
    summary: "summary",
    occurredAt: "occurred_at",
    rawContent: "raw_content",
    metadata: "metadata",
    sentiment: "sentiment",
  },
  contacts: {
    id: "id",
    firstName: "first_name",
    lastName: "last_name",
  },
  companies: {
    id: "id",
    industry: "industry",
  },
  signalOutcomes: {
    tenantId: "tenant_id",
    dealId: "deal_id",
    signalType: "signal_type",
    signalFiredAt: "signal_fired_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  desc: (x: unknown) => ({ desc: x }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...exprs: unknown[]) => ({
      sql: { strings, exprs },
    }),
    { join: (...a: unknown[]) => a },
  ),
  or: (...args: unknown[]) => ({ or: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
  isNull: (x: unknown) => ({ isNull: x }),
}));

vi.mock("@/lib/traced-ai", () => ({
  tracedGenerateObject: (...args: unknown[]) =>
    tracedGenerateObjectMock(...args),
}));

vi.mock("@/lib/ai-provider", () => ({
  anthropic: (model: string) => `mock-${model}`,
}));

vi.mock("zod", () => {
  const z = {
    object: (schema: unknown) => ({
      _schema: schema,
      describe: () => schema,
    }),
    string: () => ({ describe: (d: string) => d }),
    enum: (vals: string[]) => vals,
    array: (inner: unknown) => ({
      _inner: inner,
      describe: (d: string) => ({ _inner: inner, d }),
    }),
  };
  return { z };
});

const { analyzeWinLoss } = await import("@/lib/analysis/win-loss-engine");

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Build a chainable mock that resolves to `rows` no matter how the
 * drizzle chain terminates: `.where()`, `.where().limit()`,
 * `.from().where()`, `.orderBy().limit()`, etc.
 *
 * The trick: every method returns the same lazy proxy whose `.then()`
 * resolves to the rows array.
 */
function chainOf(rows: unknown[]): unknown {
  const self: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "limit",
    "orderBy",
    "groupBy",
    "innerJoin",
    "leftJoin",
  ];
  for (const m of methods) {
    self[m] = () => self;
  }
  // Make it thenable so `await db.select().from().where()` resolves
  self.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(rows).then(resolve, reject);
  return self;
}

function makeUpdateChain() {
  return {
    set: () => ({
      where: () => Promise.resolve(),
    }),
  };
}

function setupDbMocks(overrides: {
  deal?: Record<string, unknown>;
  activities?: unknown[];
  company?: Record<string, unknown> | null;
  contact?: Record<string, unknown> | null;
  signals?: unknown[];
  benchmark?: Record<string, unknown>;
  closedDeals?: unknown[];
}) {
  const deal = overrides.deal || {
    id: "deal-1",
    name: "Acme Deal",
    stage: "won",
    value: 50000,
    contactId: "contact-1",
    companyId: "company-1",
    properties: {},
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-03-01"),
  };

  const acts = overrides.activities || [];
  const company = overrides.company || { industry: "SaaS" };
  const contact = overrides.contact || {
    firstName: "Sarah",
    lastName: "Chen",
  };
  const signals = overrides.signals || [];
  const benchmark = overrides.benchmark || {
    avgLifecycleDays: 30,
    avgDealCount: 5,
  };
  const closedDeals = overrides.closedDeals || [];

  let callIdx = 0;

  dbMock.select.mockImplementation(() => {
    callIdx++;
    switch (callIdx) {
      case 1: // deal
        return chainOf([deal]);
      case 2: // activities
        return chainOf(acts);
      case 3: // company
        return chainOf(company ? [company] : []);
      case 4: // contact
        return chainOf(contact ? [contact] : []);
      case 5: // signals
        return chainOf(signals);
      case 6: // benchmark (db.select({...}).from(...).where(...))
        return chainOf([benchmark]);
      case 7: // closedDeals for comparison
        return chainOf(closedDeals);
      default:
        return chainOf([]);
    }
  });

  dbMock.update.mockReturnValue(makeUpdateChain());
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

// ── Engagement Velocity ─────────────────────────────────────────

describe("engagement velocity computation", () => {
  it("computes avg days between touches for 5 activities over 20 days", async () => {
    const baseDateMs = new Date("2026-01-01").getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const actDates = [0, 5, 10, 15, 20].map((d) => ({
      occurredAt: new Date(baseDateMs + d * dayMs),
      summary: null,
      direction: null,
      activityType: "email_sent",
      rawContent: null,
    }));

    setupDbMocks({ activities: actDates });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    // 5 activities, 4 gaps of 5 days each => avg = 5
    expect(result.engagementVelocity.avgDaysBetweenTouches).toBe(5);
  });

  it("returns -1 for a single activity (Infinity mapped to -1)", async () => {
    setupDbMocks({
      activities: [
        {
          occurredAt: new Date("2026-02-01"),
          summary: null,
          direction: null,
          activityType: "email_sent",
          rawContent: null,
        },
      ],
    });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.engagementVelocity.avgDaysBetweenTouches).toBe(-1);
  });

  it("returns -1 when no activities exist", async () => {
    setupDbMocks({ activities: [] });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.engagementVelocity.avgDaysBetweenTouches).toBe(-1);
  });
});

// ── Champion Detection ──────────────────────────────────────────

describe("champion detection", () => {
  it("identifies champion from deal properties championSignals", async () => {
    setupDbMocks({
      deal: {
        id: "deal-1",
        name: "Acme Deal",
        stage: "won",
        value: 50000,
        contactId: "contact-1",
        companyId: "company-1",
        properties: {
          championSignals: ["Sarah Chen"],
          lastSignalUpdate: "2026-02-15",
        },
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-03-01"),
      },
      activities: [],
    });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.championTimeline.identified).toBe(true);
    expect(result.championTimeline.who).toBe("Sarah Chen");
  });

  it("detects champion from activity summary keyword 'advocate'", async () => {
    setupDbMocks({
      activities: [
        {
          occurredAt: new Date("2026-02-10"),
          summary:
            "The contact is an internal advocate for the solution",
          direction: "inbound",
          activityType: "email_received",
          rawContent: null,
        },
      ],
    });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.championTimeline.identified).toBe(true);
    expect(result.championTimeline.who).toContain("Detected from activity");
  });

  it("returns identified: false when no champion signals exist", async () => {
    setupDbMocks({ activities: [] });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.championTimeline.identified).toBe(false);
  });
});

// ── Competitor Extraction ───────────────────────────────────────

describe("competitor extraction", () => {
  it("extracts competitors from deal properties", async () => {
    setupDbMocks({
      deal: {
        id: "deal-1",
        name: "Acme Deal",
        stage: "lost",
        value: 50000,
        contactId: "contact-1",
        companyId: "company-1",
        properties: { competitors: ["Salesforce", "HubSpot"] },
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-03-01"),
      },
      activities: [],
    });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.competitorPresence.mentioned).toBe(true);
    expect(result.competitorPresence.names).toEqual(["Salesforce", "HubSpot"]);
  });

  it("reports no competitors when none in deal properties", async () => {
    setupDbMocks({ activities: [] });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.competitorPresence.mentioned).toBe(false);
    expect(result.competitorPresence.names).toEqual([]);
  });
});

// ── Objection Handling ──────────────────────────────────────────

describe("objection handling analysis", () => {
  it("marks objection as addressed when follow-up outbound mentions topic", async () => {
    setupDbMocks({
      deal: {
        id: "deal-1",
        name: "Acme Deal",
        stage: "won",
        value: 50000,
        contactId: "contact-1",
        companyId: "company-1",
        properties: {
          objections: ["pricing concerns about enterprise tier"],
        },
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-03-01"),
      },
      activities: [
        {
          occurredAt: new Date("2026-02-15"),
          summary:
            "Sent response addressing pricing and enterprise tier details",
          direction: "outbound",
          activityType: "email_sent",
          rawContent: null,
        },
      ],
    });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.objectionHandling.length).toBe(1);
    expect(result.objectionHandling[0].wasAddressed).toBe(true);
  });

  it("marks objection as unaddressed when no follow-up matches", async () => {
    setupDbMocks({
      deal: {
        id: "deal-1",
        name: "Acme Deal",
        stage: "lost",
        value: 50000,
        contactId: "contact-1",
        companyId: "company-1",
        properties: { objections: ["integration complexity worries"] },
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-03-01"),
      },
      activities: [
        {
          occurredAt: new Date("2026-02-10"),
          summary: "Sent product overview brochure",
          direction: "outbound",
          activityType: "email_sent",
          rawContent: null,
        },
      ],
    });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.objectionHandling.length).toBe(1);
    expect(result.objectionHandling[0].wasAddressed).toBe(false);
  });

  it("returns empty array when no objections exist", async () => {
    setupDbMocks({ activities: [] });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.objectionHandling).toEqual([]);
  });
});

// ── Benchmark Comparison ────────────────────────────────────────

describe("benchmark comparison", () => {
  it("returns not enough data when only 1 closed deal exists", async () => {
    setupDbMocks({
      closedDeals: [
        { id: "deal-1", stage: "won", value: 50000, companyId: "c1" },
      ],
    });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.comparisonToSimilar.thisDealsPosition).toContain(
      "Not enough historical data",
    );
  });

  it("compares against similar deals when enough history exists", async () => {
    setupDbMocks({
      closedDeals: [
        { id: "deal-1", stage: "won", value: 50000, companyId: "c1" },
        { id: "deal-2", stage: "won", value: 45000, companyId: "c2" },
        { id: "deal-3", stage: "lost", value: 55000, companyId: "c3" },
      ],
    });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.comparisonToSimilar.similarDeals).toBeGreaterThanOrEqual(0);
  });
});

// ── Heuristic Factors (no LLM) ─────────────────────────────────

describe("heuristic factor generation (no ANTHROPIC_API_KEY)", () => {
  it("includes slow engagement factor for slow deals", async () => {
    const baseDateMs = new Date("2026-01-01").getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const acts = [0, 15, 30].map((d) => ({
      occurredAt: new Date(baseDateMs + d * dayMs),
      summary: null,
      direction: null,
      activityType: "email_sent",
      rawContent: null,
    }));

    setupDbMocks({
      deal: {
        id: "deal-1",
        name: "Slow Deal",
        stage: "lost",
        value: 50000,
        contactId: "contact-1",
        companyId: "company-1",
        properties: {},
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-03-01"),
      },
      activities: acts,
      benchmark: { avgLifecycleDays: 30, avgDealCount: 10 },
    });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    expect(result.keyFactors.length).toBeGreaterThan(0);
  });

  it("includes no-champion factor for lost deals without champion", async () => {
    setupDbMocks({
      deal: {
        id: "deal-1",
        name: "No Champion Deal",
        stage: "lost",
        value: 20000,
        contactId: "contact-1",
        companyId: "company-1",
        properties: {},
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-03-01"),
      },
      activities: [],
    });
    const result = await analyzeWinLoss("deal-1", "tenant-1");
    const noChampionFactor = result.keyFactors.find((f) =>
      f.factor.includes("No champion"),
    );
    expect(noChampionFactor).toBeDefined();
    expect(noChampionFactor!.impact).toBe("negative");
  });
});

// ── Integration Tests ───────────────────────────────────────────

describe("full integration", () => {
  it("produces complete analysis for a won deal with rich history", async () => {
    const baseDateMs = new Date("2026-01-01").getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    setupDbMocks({
      deal: {
        id: "deal-1",
        name: "Big Win",
        stage: "won",
        value: 100000,
        contactId: "contact-1",
        companyId: "company-1",
        properties: {
          championSignals: ["Alice Buyer"],
          competitors: ["Salesforce"],
          objections: ["pricing too high"],
        },
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-03-01"),
      },
      activities: [0, 3, 7, 10, 14, 18, 22, 25].map((d) => ({
        occurredAt: new Date(baseDateMs + d * dayMs),
        summary:
          d === 22
            ? "Responded to pricing objection with ROI analysis"
            : `Activity on day ${d}`,
        direction: d % 2 === 0 ? "outbound" : "inbound",
        activityType: d % 2 === 0 ? "email_sent" : "email_received",
        rawContent: null,
      })),
      signals: [
        {
          signalType: "engagement_spike",
          signalFiredAt: new Date("2026-02-01"),
        },
      ],
      closedDeals: [
        { id: "deal-1", stage: "won", value: 100000, companyId: "c1" },
        { id: "deal-2", stage: "lost", value: 90000, companyId: "c2" },
        { id: "deal-3", stage: "won", value: 110000, companyId: "c3" },
      ],
    });

    const result = await analyzeWinLoss("deal-1", "tenant-1");

    expect(result.dealId).toBe("deal-1");
    expect(result.outcome).toBe("won");
    expect(result.championTimeline.identified).toBe(true);
    expect(result.competitorPresence.mentioned).toBe(true);
    expect(result.objectionHandling.length).toBe(1);
    expect(result.engagementVelocity.avgDaysBetweenTouches).toBeGreaterThan(0);
    expect(result.lessonsLearned.length).toBeGreaterThan(0);
    expect(result.recommendedChanges.length).toBeGreaterThan(0);
  });

  it("handles lost deal with sparse history gracefully", async () => {
    setupDbMocks({
      deal: {
        id: "deal-2",
        name: "Quick Loss",
        stage: "lost",
        value: null,
        contactId: null,
        companyId: null,
        properties: {},
        createdAt: new Date("2026-02-01"),
        updatedAt: new Date("2026-02-15"),
      },
      activities: [],
      company: null,
      contact: null,
      signals: [],
      closedDeals: [],
    });

    const result = await analyzeWinLoss("deal-2", "tenant-1");

    expect(result.dealId).toBe("deal-2");
    expect(result.outcome).toBe("lost");
    expect(result.championTimeline.identified).toBe(false);
    expect(result.competitorPresence.mentioned).toBe(false);
    expect(result.objectionHandling).toEqual([]);
    expect(result.engagementVelocity.avgDaysBetweenTouches).toBe(-1);
  });
});

// ── Error Cases ─────────────────────────────────────────────────

describe("error handling", () => {
  it("throws when deal is not found", async () => {
    dbMock.select.mockReturnValue(chainOf([]));
    await expect(analyzeWinLoss("nonexistent", "tenant-1")).rejects.toThrow(
      "not found",
    );
  });

  it("throws when deal is not closed", async () => {
    dbMock.select.mockReturnValue(
      chainOf([
        {
          id: "deal-1",
          name: "Open Deal",
          stage: "demo",
          value: 10000,
          contactId: null,
          companyId: null,
          properties: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    );
    await expect(analyzeWinLoss("deal-1", "tenant-1")).rejects.toThrow(
      "not closed",
    );
  });
});
