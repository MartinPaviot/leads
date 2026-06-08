import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/db/schema", () => ({
  tamProposals: { id: "id", tenantId: "tenantId", kind: "kind", dedupKey: "dedupKey", status: "status", createdAt: "createdAt" },
  companies: { id: "id", tenantId: "tenantId" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...a) => ({ _and: a })),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  sql: Object.assign(
    vi.fn(() => "sql"),
    { identifier: vi.fn((s: string) => s) },
  ),
}));

const sendMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/inngest/client", () => ({ inngest: { send: (...a: unknown[]) => sendMock(...a) } }));

// applyProposal("add") now consults the suppression ledger via filterAllowed
// before inserting (never re-add a removed/excluded account). Stub it as a
// pass-through (nothing suppressed); the ledger itself is covered by
// account-suppression.test.ts.
vi.mock("@/lib/accounts/suppression", () => ({
  filterAllowed: vi.fn(async (_tenantId: string, candidates: unknown[]) => candidates),
}));

import { db } from "@/db";
import { proposeTamChange, applyProposal, decideProposals } from "@/lib/tam/proposals";

/** db.select()...limit() resolves to `rows` */
function mockSelectResolves(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as never);
  return { from, where, limit };
}

function mockInsertReturns(rows: Array<{ id: string }>) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as never);
  return { values, returning };
}

function mockUpdate() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValue({ set } as never);
  return { set, where };
}

describe("proposeTamChange", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips when a pending proposal with the same dedupKey exists", async () => {
    mockSelectResolves([{ id: "existing" }]);
    const r = await proposeTamChange({ tenantId: "t1", kind: "add", dedupKey: "acme.com" });
    expect(r).toEqual({ created: false, id: "existing" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts when no duplicate exists", async () => {
    mockSelectResolves([]);
    const { values } = mockInsertReturns([{ id: "new-1" }]);
    const r = await proposeTamChange({ tenantId: "t1", kind: "add", dedupKey: "acme.com", payload: { name: "Acme" } });
    expect(r).toEqual({ created: true, id: "new-1" });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", kind: "add", dedupKey: "acme.com" }));
  });
});

describe("applyProposal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("add: inserts a company and fires enrichment", async () => {
    mockSelectResolves([]); // domain-dedup check finds no existing company
    const { values } = mockInsertReturns([{ id: "co-1" }]);
    const res = await applyProposal({
      id: "p1", tenantId: "t1", kind: "add", status: "pending", dedupKey: "acme.com",
      entityType: null, entityId: null, payload: { name: "Acme", domain: "acme.com" },
      summary: null, reason: null, source: "icp_source", score: null,
      appliedEntityId: null, reviewedByUserId: null, reviewedAt: null, createdAt: new Date(),
    } as never);
    expect(res.ok).toBe(true);
    expect(res.appliedEntityId).toBe("co-1");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ name: "Acme", domain: "acme.com", sourceSystem: "icp_source" }));
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ name: "company/created" }));
  });

  it("exclude: sets excludedReason on the target company", async () => {
    const { set } = mockUpdate();
    const res = await applyProposal({
      id: "p2", tenantId: "t1", kind: "exclude", status: "pending", dedupKey: "company:co-9",
      entityType: "company", entityId: "co-9", payload: { reason: "anti_icp_size" },
      summary: null, reason: null, source: "anti_icp", score: null,
      appliedEntityId: null, reviewedByUserId: null, reviewedAt: null, createdAt: new Date(),
    } as never);
    expect(res.ok).toBe(true);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ excludedReason: "anti_icp_size" }));
  });

  it("refresh without entityId fails cleanly", async () => {
    const res = await applyProposal({
      id: "p3", tenantId: "t1", kind: "refresh", status: "pending", dedupKey: null,
      entityType: "company", entityId: null, payload: {},
      summary: null, reason: null, source: "refresh_cron", score: null,
      appliedEntityId: null, reviewedByUserId: null, reviewedAt: null, createdAt: new Date(),
    } as never);
    expect(res.ok).toBe(false);
  });
});

describe("decideProposals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reject marks pending proposals rejected without applying", async () => {
    // select() returns the pending rows
    const where = vi.fn().mockResolvedValue([
      { id: "p1", tenantId: "t1", kind: "add", status: "pending", payload: {}, entityId: null },
    ]);
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);
    const { set } = mockUpdate();

    const r = await decideProposals({ tenantId: "t1", userId: "u1", ids: ["p1"], action: "reject" });
    expect(r).toEqual({ approved: 0, rejected: 1, failed: 0 });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    expect(sendMock).not.toHaveBeenCalled();
  });
});
