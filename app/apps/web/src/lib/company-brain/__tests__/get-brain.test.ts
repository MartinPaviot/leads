/**
 * Tests for getCompanyBrain.
 *
 * Mocks the DB chain so we exercise the assembly logic without a
 * Postgres harness. The contract this pins :
 *   - tenant filter is applied (cross-tenant returns null)
 *   - capping flips the truncated flags
 *   - missing layers return empty arrays, never throw
 *   - meetings are derived from activities by type filter
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────
const { selectChainMock } = vi.hoisted(() => ({
  selectChainMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: () => selectChainMock() },
}));

vi.mock("@/db/schema", () => ({
  companies: {
    id: "id",
    tenantId: "tenant_id",
    name: "name",
    domain: "domain",
    industry: "industry",
    size: "size",
    score: "score",
    createdAt: "created_at",
  },
  contacts: {
    id: "id",
    tenantId: "tenant_id",
    companyId: "company_id",
    firstName: "first_name",
    lastName: "last_name",
    email: "email",
    title: "title",
    updatedAt: "updated_at",
  },
  deals: {
    id: "id",
    tenantId: "tenant_id",
    companyId: "company_id",
    name: "name",
    stage: "stage",
    value: "value",
    expectedCloseDate: "expected_close_date",
    properties: "properties",
  },
  activities: {
    id: "id",
    tenantId: "tenant_id",
    entityType: "entity_type",
    entityId: "entity_id",
    activityType: "activity_type",
    direction: "direction",
    occurredAt: "occurred_at",
    summary: "summary",
  },
  knowledgeEntries: {
    id: "id",
    tenantId: "tenant_id",
    title: "title",
    body: "body",
    scope: "scope",
  },
  contextGraphEdges: {
    sourceNodeId: "source",
    targetNodeId: "target",
    relationType: "relation_type",
    fact: "fact",
    confidence: "confidence",
    tenantId: "tenant_id",
  },
  contextGraphNodes: {
    id: "id",
    tenantId: "tenant_id",
    entityType: "entity_type",
    entityId: "entity_id",
  },
  chatMemories: {
    id: "id",
    tenantId: "tenant_id",
    scope: "scope",
    content: "content",
    createdAt: "created_at",
  },
  transcriptChunks: {
    meetingId: "meeting_id",
  },
}));

// Both helpers are deps-injectable, so we pass stubs explicitly
// instead of mocking the modules.

import { getCompanyBrain } from "../get-brain";

function chainOf(rows: unknown[]) {
  // Return an object whose `from`, `where`, `orderBy`, `limit` all
  // chain to a thenable that resolves to `rows`. drizzle's chain
  // varies per query so we accept any sequence.
  const tail: any = Promise.resolve(rows);
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: tail.then.bind(tail),
    catch: tail.catch.bind(tail),
    finally: tail.finally.bind(tail),
  };
  return chain;
}

const COMPANY_ROW = {
  id: "co-1",
  tenantId: "tenant-A",
  name: "AcmeCorp",
  domain: "acme.test",
  industry: "SaaS",
  sizeBand: "51-200",
  score: 78,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const stallStub = vi.fn(async () => []);
const intentStub = vi.fn(async () => ({
  contactId: "c1",
  score: 65,
  signals: [],
  trend: "stable" as const,
  lastUpdated: new Date().toISOString(),
}));

beforeEach(() => {
  selectChainMock.mockReset();
  stallStub.mockClear();
  intentStub.mockClear();
});

describe("getCompanyBrain — multi-tenant safety", () => {
  it("returns null when company belongs to a different tenant", async () => {
    selectChainMock.mockImplementationOnce(() =>
      chainOf([{ ...COMPANY_ROW, tenantId: "tenant-B" }]),
    );
    const brain = await getCompanyBrain(
      "co-1",
      { tenantId: "tenant-A" },
      { predictStallsFn: stallStub, scoreBuyerIntentFn: intentStub as any },
    );
    expect(brain).toBeNull();
    // Layer queries should NOT have run for an unauthorised company
    expect(selectChainMock).toHaveBeenCalledTimes(1);
  });

  it("throws when tenantId is missing", async () => {
    await expect(
      getCompanyBrain("co-1", { tenantId: "" } as any, {
        predictStallsFn: stallStub,
        scoreBuyerIntentFn: intentStub as any,
      }),
    ).rejects.toThrow(/tenantId/);
  });

  it("throws when companyId is missing", async () => {
    await expect(
      getCompanyBrain("", { tenantId: "tenant-A" }, {
        predictStallsFn: stallStub,
        scoreBuyerIntentFn: intentStub as any,
      }),
    ).rejects.toThrow(/companyId/);
  });
});

describe("getCompanyBrain — empty-layer happy path", () => {
  it("assembles a brain with all empty layers when DB is empty", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1) return chainOf([COMPANY_ROW]); // company
      // contacts, deals, activities, knowledge, edges, memories — all empty
      return chainOf([]);
    });
    const brain = await getCompanyBrain(
      "co-1",
      { tenantId: "tenant-A" },
      { predictStallsFn: stallStub, scoreBuyerIntentFn: intentStub as any },
    );
    expect(brain).not.toBeNull();
    expect(brain!.company.id).toBe("co-1");
    expect(brain!.contacts).toEqual([]);
    expect(brain!.deals).toEqual([]);
    expect(brain!.activities).toEqual([]);
    expect(brain!.meetings).toEqual([]);
    expect(brain!.knowledgeEntries).toEqual([]);
    expect(brain!.contextGraphEdges).toEqual([]);
    expect(brain!.memories).toEqual([]);
    expect(brain!.dossier).toBeNull();
    expect(brain!.truncated).toEqual({
      activities: false,
      contacts: false,
      memories: false,
    });
  });
});

describe("getCompanyBrain — meetings derived from activities", () => {
  it("filters activities of meeting type into the meetings array", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1) return chainOf([COMPANY_ROW]); // company
      if (call === 2) return chainOf([]); // company graph node
      if (call === 3) return chainOf([]); // contacts
      if (call === 4) return chainOf([]); // deals
      if (call === 5)
        return chainOf([
          {
            id: "act-meeting",
            type: "meeting_completed",
            direction: "internal",
            occurredAt: new Date("2026-04-15"),
            summary: "Discovery call",
            entityType: "company",
            entityId: "co-1",
          },
          {
            id: "act-email",
            type: "email_sent",
            direction: "outbound",
            occurredAt: new Date("2026-04-14"),
            summary: "Sent intro email",
            entityType: "company",
            entityId: "co-1",
          },
        ]);
      if (call === 6) return chainOf([]); // knowledge
      if (call === 7) return chainOf([]); // edges
      if (call === 8) return chainOf([]); // memories
      if (call === 9) return chainOf([]); // transcript chunks (meetingIds non-empty)
      return chainOf([]);
    });

    const brain = await getCompanyBrain(
      "co-1",
      { tenantId: "tenant-A" },
      { predictStallsFn: stallStub, scoreBuyerIntentFn: intentStub as any },
    );
    expect(brain!.meetings).toHaveLength(1);
    expect(brain!.meetings[0]!.id).toBe("act-meeting");
    expect(brain!.meetings[0]!.title).toBe("Discovery call");
    expect(brain!.meetings[0]!.transcriptChunkCount).toBe(0);
    expect(brain!.activities).toHaveLength(2); // both retained in activities
  });
});

describe("getCompanyBrain — truncation flags", () => {
  it("flips truncated.activities when more rows than the cap come back", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1) return chainOf([COMPANY_ROW]); // company
      if (call === 2) return chainOf([]); // company graph node
      if (call === 3) return chainOf([]); // contacts
      if (call === 4) return chainOf([]); // deals
      if (call === 5)
        // 6 rows when cap = 5 → query asks for cap+1=6 → 6 rows
        return chainOf(
          Array.from({ length: 6 }, (_, i) => ({
            id: `act-${i}`,
            type: "email_sent",
            direction: "outbound",
            occurredAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}`),
            summary: null,
            entityType: "company",
            entityId: "co-1",
          })),
        );
      if (call === 6) return chainOf([]); // knowledge
      if (call === 7) return chainOf([]); // edges
      if (call === 8) return chainOf([]); // memories
      return chainOf([]);
    });

    const brain = await getCompanyBrain(
      "co-1",
      { tenantId: "tenant-A", recentActivityCap: 5 },
      { predictStallsFn: stallStub, scoreBuyerIntentFn: intentStub as any },
    );
    expect(brain!.activities).toHaveLength(5);
    expect(brain!.truncated.activities).toBe(true);
  });
});

describe("getCompanyBrain — deal property metadata coercion", () => {
  it("normalises legacy bare values into citation shape", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1) return chainOf([COMPANY_ROW]); // company
      if (call === 2) return chainOf([]); // company graph node
      if (call === 3) return chainOf([]); // contacts
      if (call === 4)
        return chainOf([
          {
            id: "deal-1",
            name: "AcmeCorp Q2 expansion",
            stage: "demo",
            value: 50000,
            expectedCloseDate: null,
            properties: {
              budget: { value: "$50K", source: "transcript", date: "2026-04-01", manual: false, confidence: 0.85 },
              competitor: "Hubspot", // legacy bare value
              riskLevel: "medium",
              riskReasons: ["No champion identified"],
            },
          },
        ]);
      if (call === 5) return chainOf([]); // activities
      if (call === 6) return chainOf([]); // knowledge
      if (call === 7) return chainOf([]); // edges
      if (call === 8) return chainOf([]); // memories
      return chainOf([]);
    });

    const brain = await getCompanyBrain(
      "co-1",
      { tenantId: "tenant-A" },
      { predictStallsFn: stallStub, scoreBuyerIntentFn: intentStub as any },
    );

    const d = brain!.deals[0]!;
    // New-shape citation preserved
    expect(d.properties.budget!.value).toBe("$50K");
    expect(d.properties.budget!.source).toBe("transcript");
    expect(d.properties.budget!.confidence).toBe(0.85);
    // Legacy bare value coerced
    expect(d.properties.competitor!.value).toBe("Hubspot");
    expect(d.properties.competitor!.source).toBe("legacy");
    expect(d.properties.competitor!.confidence).toBeNull();
    // Risk hydrated
    expect(d.riskLevel).toBe("medium");
    expect(d.riskReasons).toEqual(["No champion identified"]);
    // Stall fields default to null/[] when no prediction
    expect(d.stallProbability).toBeNull();
    expect(d.stallIndicators).toEqual([]);
  });
});

describe("getCompanyBrain — graph facts scoped to the company (P1 06)", () => {
  it("loads graph edges only once the company has a node, then returns them", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1) return chainOf([COMPANY_ROW]); // company
      if (call === 2) return chainOf([{ id: "node-co-1" }]); // company graph node (found)
      if (call === 3) return chainOf([]); // contacts
      if (call === 4) return chainOf([]); // deals
      if (call === 5) return chainOf([]); // activities
      if (call === 6) return chainOf([]); // knowledge
      if (call === 7)
        // edges scoped to the company node
        return chainOf([
          { sourceId: "node-co-1", targetId: "node-x", relationType: "champion", fact: "F", confidence: 0.9 },
        ]);
      if (call === 8) return chainOf([]); // memories
      return chainOf([]);
    });

    const brain = await getCompanyBrain(
      "co-1",
      { tenantId: "tenant-A" },
      { predictStallsFn: stallStub, scoreBuyerIntentFn: intentStub as any },
    );
    expect(brain!.contextGraphEdges).toHaveLength(1);
  });
});
