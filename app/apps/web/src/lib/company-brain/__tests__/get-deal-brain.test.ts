import { describe, it, expect, vi, beforeEach } from "vitest";

const { selectChainMock } = vi.hoisted(() => ({
  selectChainMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: () => selectChainMock() },
}));

vi.mock("@/db/schema", () => ({
  deals: {
    id: "id",
    tenantId: "tenant_id",
    companyId: "company_id",
    contactId: "contact_id",
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
}));

import { getDealBrain } from "../get-deal-brain";
import type { CompanyBrain } from "../types";

function chainOf(rows: unknown[]) {
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

function fakeCompanyBrain(
  overrides: Partial<CompanyBrain> = {},
): CompanyBrain {
  return {
    company: {
      id: "co-1",
      name: "AcmeCorp",
      domain: null,
      industry: null,
      sizeBand: null,
      score: null,
      createdAt: new Date("2026-01-01"),
    },
    contacts: [],
    deals: [],
    activities: [],
    meetings: [],
    knowledgeEntries: [],
    contextGraphEdges: [],
    memories: [],
    dossier: null,
    freshness: {
      company: new Date("2026-01-01"),
      contacts: null,
      deals: null,
      activities: null,
      meetings: null,
      transcriptChunks: null,
      knowledgeEntries: null,
      contextGraphEdges: null,
      memories: null,
      dossier: null,
    },
    truncated: { activities: false, contacts: false, memories: false },
    ...overrides,
  };
}

const stubBrain = vi.fn();

beforeEach(() => {
  selectChainMock.mockReset();
  stubBrain.mockReset();
});

describe("getDealBrain — guards", () => {
  it("throws when tenantId missing", async () => {
    await expect(
      getDealBrain("d-1", { tenantId: "" } as any, {
        getCompanyBrainFn: stubBrain as any,
      }),
    ).rejects.toThrow(/tenantId/);
  });

  it("throws when dealId missing", async () => {
    await expect(
      getDealBrain("", { tenantId: "tenant-A" }, {
        getCompanyBrainFn: stubBrain as any,
      }),
    ).rejects.toThrow(/dealId/);
  });

  it("returns null when deal does not exist in tenant", async () => {
    selectChainMock.mockImplementation(() => chainOf([]));
    const brain = await getDealBrain(
      "d-1",
      { tenantId: "tenant-A" },
      { getCompanyBrainFn: stubBrain as any },
    );
    expect(brain).toBeNull();
    expect(stubBrain).not.toHaveBeenCalled();
  });
});

describe("getDealBrain — happy path", () => {
  it("hydrates focal deal + primary contact + deal activities", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1) {
        // deal resolution
        return chainOf([
          {
            id: "d-1",
            tenantId: "tenant-A",
            companyId: "co-1",
            contactId: "ct-1",
          },
        ]);
      }
      if (call === 2) {
        // deal activities
        return chainOf([
          {
            id: "a1",
            type: "stage_change",
            direction: null,
            occurredAt: new Date("2026-04-15"),
            summary: "demo → proposal",
            entityType: "deal",
            entityId: "d-1",
          },
        ]);
      }
      return chainOf([]);
    });

    stubBrain.mockResolvedValue(
      fakeCompanyBrain({
        deals: [
          {
            id: "d-1",
            name: "Acme Q2 expansion",
            stage: "proposal",
            value: 50000,
            expectedCloseDate: new Date("2026-06-30"),
            properties: {
              budget: {
                value: "$50K",
                source: "transcript",
                date: null,
                manual: false,
                confidence: 0.85,
              },
            },
            riskLevel: "medium",
            riskReasons: ["No champion identified"],
            stallProbability: 0.3,
            stallIndicators: [],
          },
        ],
        contacts: [
          {
            id: "ct-1",
            firstName: "Alice",
            lastName: "Doe",
            email: "alice@acme.test",
            title: "VP Eng",
            isChampion: true,
            intentScore: 80,
            intentTrend: "heating",
            lastTouchAt: new Date("2026-04-15"),
          },
        ],
      }),
    );

    const brain = await getDealBrain(
      "d-1",
      { tenantId: "tenant-A" },
      { getCompanyBrainFn: stubBrain as any },
    );
    expect(brain).not.toBeNull();
    expect(brain!.focalDeal.id).toBe("d-1");
    expect(brain!.focalDeal.riskLevel).toBe("medium");
    expect(brain!.focalDeal.properties.budget!.confidence).toBe(0.85);
    expect(brain!.primaryContact?.id).toBe("ct-1");
    expect(brain!.primaryContact?.isChampion).toBe(true);
    expect(brain!.dealActivities).toHaveLength(1);
    expect(brain!.dealActivities[0]!.type).toBe("stage_change");
    expect(brain!.truncated.dealActivities).toBe(false);
  });

  it("primaryContact is null when deal has no contact_id", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1)
        return chainOf([
          {
            id: "d-1",
            tenantId: "tenant-A",
            companyId: "co-1",
            contactId: null,
          },
        ]);
      return chainOf([]);
    });
    stubBrain.mockResolvedValue(fakeCompanyBrain());

    const brain = await getDealBrain(
      "d-1",
      { tenantId: "tenant-A" },
      { getCompanyBrainFn: stubBrain as any },
    );
    expect(brain!.primaryContact).toBeNull();
  });

  it("flips truncated.dealActivities at cap+1", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1)
        return chainOf([
          {
            id: "d-1",
            tenantId: "tenant-A",
            companyId: "co-1",
            contactId: null,
          },
        ]);
      if (call === 2)
        return chainOf(
          Array.from({ length: 4 }, (_, i) => ({
            id: `a-${i}`,
            type: "note",
            direction: null,
            occurredAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}`),
            summary: null,
            entityType: "deal",
            entityId: "d-1",
          })),
        );
      return chainOf([]);
    });
    stubBrain.mockResolvedValue(fakeCompanyBrain());

    const brain = await getDealBrain(
      "d-1",
      { tenantId: "tenant-A", dealActivityCap: 3 },
      { getCompanyBrainFn: stubBrain as any },
    );
    expect(brain!.dealActivities).toHaveLength(3);
    expect(brain!.truncated.dealActivities).toBe(true);
  });

  it("falls back to stub focal deal when deal is outside companyBrain cap", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1)
        return chainOf([
          {
            id: "d-99",
            tenantId: "tenant-A",
            companyId: "co-1",
            contactId: null,
          },
        ]);
      return chainOf([]);
    });
    stubBrain.mockResolvedValue(
      fakeCompanyBrain({
        deals: [
          {
            id: "d-other",
            name: "Other deal",
            stage: "lead",
            value: null,
            expectedCloseDate: null,
            properties: {},
            riskLevel: null,
            riskReasons: [],
            stallProbability: null,
            stallIndicators: [],
          },
        ],
      }),
    );
    const brain = await getDealBrain(
      "d-99",
      { tenantId: "tenant-A" },
      { getCompanyBrainFn: stubBrain as any },
    );
    expect(brain!.focalDeal.id).toBe("d-99");
    expect(brain!.focalDeal.stage).toBe("unknown");
  });
});
