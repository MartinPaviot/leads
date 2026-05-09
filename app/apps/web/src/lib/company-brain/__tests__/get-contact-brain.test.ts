/**
 * Tests for getContactBrain. The DB chain is mocked so we exercise
 * the assembly logic only ; getCompanyBrain is stubbed because it
 * has its own dedicated test suite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { selectChainMock } = vi.hoisted(() => ({
  selectChainMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: () => selectChainMock() },
}));

vi.mock("@/db/schema", () => ({
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
  deals: {
    id: "id",
    tenantId: "tenant_id",
    contactId: "contact_id",
  },
}));

import { getContactBrain } from "../get-contact-brain";
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

describe("getContactBrain — multi-tenant safety", () => {
  it("forwards opts.tenantId to the surrounding company brain", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1)
        return chainOf([
          { id: "ct-1", tenantId: "tenant-A", companyId: "co-1" },
        ]);
      return chainOf([]);
    });
    stubBrain.mockResolvedValue(fakeCompanyBrain());
    await getContactBrain(
      "ct-1",
      { tenantId: "tenant-A" },
      { getCompanyBrainFn: stubBrain as any },
    );
    expect(stubBrain).toHaveBeenCalledWith(
      "co-1",
      expect.objectContaining({ tenantId: "tenant-A" }),
      expect.anything(),
    );
  });

  it("returns null when the surrounding company brain comes back null (cross-tenant company)", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1)
        return chainOf([
          // Contact belongs to tenant-A but its company is in tenant-B —
          // getCompanyBrain refuses cross-tenant and returns null,
          // which contact brain must propagate.
          { id: "ct-1", tenantId: "tenant-A", companyId: "co-cross-tenant" },
        ]);
      return chainOf([]);
    });
    stubBrain.mockResolvedValue(null);
    const brain = await getContactBrain(
      "ct-1",
      { tenantId: "tenant-A" },
      { getCompanyBrainFn: stubBrain as any },
    );
    expect(brain).toBeNull();
  });
});

describe("getContactBrain — guards", () => {
  it("throws when tenantId missing", async () => {
    await expect(
      getContactBrain("ct-1", { tenantId: "" } as any, {
        getCompanyBrainFn: stubBrain as any,
      }),
    ).rejects.toThrow(/tenantId/);
  });

  it("throws when contactId missing", async () => {
    await expect(
      getContactBrain("", { tenantId: "tenant-A" }, {
        getCompanyBrainFn: stubBrain as any,
      }),
    ).rejects.toThrow(/contactId/);
  });

  it("returns null when contact does not exist in tenant", async () => {
    selectChainMock.mockImplementation(() => chainOf([])); // no contact row
    const brain = await getContactBrain(
      "ct-1",
      { tenantId: "tenant-A" },
      { getCompanyBrainFn: stubBrain as any },
    );
    expect(brain).toBeNull();
    expect(stubBrain).not.toHaveBeenCalled();
  });
});

describe("getContactBrain — happy path", () => {
  it("hydrates focal contact + direct activities + owned deals", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1) {
        // contact resolution
        return chainOf([
          { id: "ct-1", tenantId: "tenant-A", companyId: "co-1" },
        ]);
      }
      if (call === 2) {
        // direct activities
        return chainOf([
          {
            id: "a1",
            type: "email_sent",
            direction: "outbound",
            occurredAt: new Date("2026-04-15"),
            summary: "intro email",
            entityType: "contact",
            entityId: "ct-1",
          },
          {
            id: "a2",
            type: "email_received",
            direction: "inbound",
            occurredAt: new Date("2026-04-16"),
            summary: "reply",
            entityType: "contact",
            entityId: "ct-1",
          },
        ]);
      }
      if (call === 3) {
        // owned deals (just ids)
        return chainOf([{ id: "d1" }]);
      }
      return chainOf([]);
    });

    stubBrain.mockResolvedValue(
      fakeCompanyBrain({
        contacts: [
          {
            id: "ct-1",
            firstName: "Alice",
            lastName: "Doe",
            email: "alice@acme.test",
            title: "VP Eng",
            isChampion: true,
            intentScore: 85,
            intentTrend: "heating",
            lastTouchAt: new Date("2026-04-16"),
          },
          {
            id: "ct-2",
            firstName: "Bob",
            lastName: null,
            email: null,
            title: null,
            isChampion: false,
            intentScore: null,
            intentTrend: null,
            lastTouchAt: null,
          },
        ],
        deals: [
          {
            id: "d1",
            name: "Acme Q2",
            stage: "demo",
            value: 50000,
            expectedCloseDate: new Date("2026-06-30"),
            properties: {},
            riskLevel: "low",
            riskReasons: [],
            stallProbability: null,
            stallIndicators: [],
          },
          {
            id: "d2",
            name: "Acme support add-on",
            stage: "lead",
            value: 5000,
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

    const brain = await getContactBrain(
      "ct-1",
      { tenantId: "tenant-A" },
      { getCompanyBrainFn: stubBrain as any },
    );

    expect(brain).not.toBeNull();
    expect(brain!.focalContact.id).toBe("ct-1");
    expect(brain!.focalContact.isChampion).toBe(true);
    expect(brain!.focalContact.intentScore).toBe(85);
    expect(brain!.directActivities).toHaveLength(2);
    expect(brain!.ownedDeals.map((d) => d.id)).toEqual(["d1"]);
    expect(brain!.companyBrain.contacts).toHaveLength(2);
    expect(brain!.truncated.directActivities).toBe(false);
    expect(brain!.freshness.directActivities?.toISOString()).toBe(
      new Date("2026-04-16").toISOString(),
    );
  });

  it("flips truncated.directActivities at cap+1", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1)
        return chainOf([
          { id: "ct-1", tenantId: "tenant-A", companyId: "co-1" },
        ]);
      if (call === 2)
        return chainOf(
          Array.from({ length: 6 }, (_, i) => ({
            id: `a-${i}`,
            type: "email",
            direction: "outbound",
            occurredAt: new Date(`2026-04-${String(10 + i).padStart(2, "0")}`),
            summary: null,
            entityType: "contact",
            entityId: "ct-1",
          })),
        );
      if (call === 3) return chainOf([]); // no owned deals
      return chainOf([]);
    });
    stubBrain.mockResolvedValue(fakeCompanyBrain());

    const brain = await getContactBrain(
      "ct-1",
      { tenantId: "tenant-A", directActivityCap: 5 },
      { getCompanyBrainFn: stubBrain as any },
    );
    expect(brain!.directActivities).toHaveLength(5);
    expect(brain!.truncated.directActivities).toBe(true);
  });

  it("returns minimal stub focal contact when company brain caps it out", async () => {
    let call = 0;
    selectChainMock.mockImplementation(() => {
      call++;
      if (call === 1)
        return chainOf([
          { id: "ct-1", tenantId: "tenant-A", companyId: "co-1" },
        ]);
      return chainOf([]); // empty activities + empty deals
    });
    stubBrain.mockResolvedValue(
      fakeCompanyBrain({
        contacts: [
          // ct-1 not in this list because of contactCap=1 returning ct-2 only
          {
            id: "ct-2",
            firstName: "Bob",
            lastName: null,
            email: null,
            title: null,
            isChampion: false,
            intentScore: null,
            intentTrend: null,
            lastTouchAt: null,
          },
        ],
      }),
    );

    const brain = await getContactBrain(
      "ct-1",
      { tenantId: "tenant-A" },
      { getCompanyBrainFn: stubBrain as any },
    );
    expect(brain!.focalContact.id).toBe("ct-1");
    expect(brain!.focalContact.firstName).toBeNull();
    expect(brain!.focalContact.isChampion).toBe(false);
  });
});
