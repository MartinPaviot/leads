import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, retrieveMock } = vi.hoisted(() => ({
  dbMock: { select: vi.fn() },
  retrieveMock: vi.fn(),
}));

vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/db/schema", () => ({
  activities: { tenantId: "t", entityType: "et", entityId: "ei", activityType: "at", direction: "dir", summary: "s", rawContent: "rc", occurredAt: "oa" },
  notes: { tenantId: "t", entityType: "et", entityId: "ei", title: "ti", content: "c", createdAt: "ca" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (...a: unknown[]) => ({ eq: a }),
  or: (...a: unknown[]) => ({ or: a }),
  desc: (x: unknown) => ({ desc: x }),
}));
vi.mock("@/lib/knowledge/retrieval", () => ({
  retrieveKnowledge: (...a: unknown[]) => retrieveMock(...a),
}));

const { collectCitableSources } = await import("../sources");

function chain(rows: unknown[]) {
  const self: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) self[m] = () => self;
  self.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
    Promise.resolve(rows).then(res, rej);
  return self;
}

beforeEach(() => vi.clearAllMocks());

describe("collectCitableSources", () => {
  it("enumerates activities + notes into citable sources with stable ids", async () => {
    let i = 0;
    dbMock.select.mockImplementation(() => {
      i++;
      return chain(
        i === 1
          ? [{ activityType: "email_sent", direction: "outbound", summary: "hi", rawContent: "full email body", occurredAt: new Date("2026-05-28T00:00:00Z") }]
          : [{ title: "Budget", content: "CFO approved 80k", createdAt: new Date("2026-05-20T00:00:00Z") }],
      );
    });

    const { sources, block, byId } = await collectCitableSources("t1", { dealId: "d1", companyId: "co1" });

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ id: "A1", type: "activity", label: "email_sent outbound", snippet: "full email body", date: "2026-05-28" });
    expect(sources[1]).toMatchObject({ id: "N1", type: "note", label: "Budget", snippet: "CFO approved 80k", date: "2026-05-20" });
    expect(block).toContain("[A1]");
    expect(block).toContain("[N1]");
    expect(byId.get("A1")).toBeDefined();
    expect(byId.get("N1")).toBeDefined();
  });

  it("returns an empty, well-formed result when there is nothing to cite", async () => {
    const { sources, block } = await collectCitableSources("t1", {});
    expect(sources).toEqual([]);
    expect(block).toBe("(no recorded interactions)");
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("includes Elevay knowledge as citable [K..] sources (PROPOSAL-009 AC3)", async () => {
    retrieveMock.mockResolvedValue([{ title: "Pricing", content: "Starter 49, Pro 99" }]);
    const { sources, block, byId } = await collectCitableSources("t1", { knowledgeQuery: "pricing" });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ id: "K1", type: "knowledge", label: "Pricing", snippet: "Starter 49, Pro 99" });
    expect(block).toContain("[K1]");
    expect(byId.get("K1")).toBeDefined();
  });
});
