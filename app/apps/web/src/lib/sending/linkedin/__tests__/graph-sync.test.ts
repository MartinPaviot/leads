import { describe, it, expect, vi, beforeEach } from "vitest";

// db.select(...).from(...).where(...) resolves to the next queued result, so the
// three sequential queries (seats -> crm -> per-seat relations) each get theirs.
let results: unknown[] = [];
function makeChain() {
  const c: Record<string, any> = {};
  for (const m of ["from", "where", "limit", "orderBy"]) c[m] = vi.fn(() => c);
  c.then = (res: (v: unknown) => unknown) => res(results.shift() ?? []);
  return c;
}
vi.mock("@/db", () => ({ db: { select: vi.fn(() => makeChain()) } }));
vi.mock("@/db/schema", () => ({
  linkedinAccount: { id: "la.id", tenantId: "la.tenantId", userId: "la.userId", displayName: "la.displayName", status: "la.status" },
  linkedinRelation: { linkedinAccountId: "lr.accountId", profileUrl: "lr.profileUrl", displayName: "lr.displayName", providerId: "lr.providerId", tenantId: "lr.tenantId", connectionDegree: "lr.degree" },
  contacts: { id: "c.id", tenantId: "c.tenantId", linkedinUrl: "c.linkedinUrl", firstName: "c.firstName", lastName: "c.lastName" },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...a: unknown[]) => ({ _and: a })),
  eq: vi.fn((col: unknown, v: unknown) => ({ _eq: [col, v] })),
  isNotNull: vi.fn((col: unknown) => ({ _isNotNull: col })),
}));
// graph-sync imports these at module load; rematch doesn't use them.
vi.mock("@/lib/providers/unipile/http", () => ({ readUnipileConfig: vi.fn(() => null), listUnipileRelations: vi.fn() }));

const buildKnowsFromLinkedInRelations = vi.fn();
vi.mock("@/lib/context/relationship-graph", () => ({
  buildKnowsFromLinkedInRelations: (...a: unknown[]) => buildKnowsFromLinkedInRelations(...a),
}));
const recordCompanySignal = vi.fn();
vi.mock("@/lib/signals/record-signal", () => ({
  recordCompanySignal: (...a: unknown[]) => recordCompanySignal(...a),
}));
// Use the REAL linkedinPath (pure) so normalization is exercised end-to-end.

const { rematchStoredRelations } = await import("@/lib/sending/linkedin/graph-sync");

beforeEach(() => {
  vi.clearAllMocks();
  results = [];
  buildKnowsFromLinkedInRelations.mockResolvedValue({ edgesCreated: 1, edgesUpdated: 0 });
});

describe("rematchStoredRelations (snapshot-based, no Unipile)", () => {
  it("matches CRM contacts to the stored snapshot by normalized linkedin path and builds edges", async () => {
    results = [
      [{ id: "seat1", userId: "u1", displayName: "Martin Paviot" }], // seats
      [
        { id: "c1", companyId: "co1", linkedinUrl: "https://www.LinkedIn.com/in/Jane-Doe/", firstName: "Jane", lastName: "Doe" },
        { id: "c2", companyId: "co2", linkedinUrl: "https://linkedin.com/in/bob", firstName: "Bob", lastName: null },
      ], // crm
      [{ profileUrl: "linkedin.com/in/jane-doe", displayName: "Jane D." }], // seat1 relations (only Jane)
    ];
    const r = await rematchStoredRelations("t1");
    expect(r).toEqual({ seats: 1, matched: 1, edgesCreated: 1, edgesUpdated: 0, warmSignalsEmitted: 1 });
    expect(buildKnowsFromLinkedInRelations).toHaveBeenCalledTimes(1);
    const arg = buildKnowsFromLinkedInRelations.mock.calls[0][0];
    expect(arg.viaUserId).toBe("u1");
    expect(arg.viaUserName).toBe("Martin Paviot");
    expect(arg.relations).toEqual([{ contactId: "c1", contactName: "Jane Doe", profileUrl: "linkedin.com/in/jane-doe" }]);
    // Jane's company gets a warm_connection signal; Bob (unmatched) does not.
    expect(recordCompanySignal).toHaveBeenCalledTimes(1);
    expect(recordCompanySignal).toHaveBeenCalledWith("t1", "co1", expect.objectContaining({ type: "warm_connection" }));
  });

  it("no connected seats -> no work", async () => {
    results = [[]]; // seats empty
    const r = await rematchStoredRelations("t1");
    expect(r).toEqual({ seats: 0, matched: 0, edgesCreated: 0, edgesUpdated: 0, warmSignalsEmitted: 0 });
    expect(buildKnowsFromLinkedInRelations).not.toHaveBeenCalled();
  });

  it("seat with relations but zero CRM matches builds no edges", async () => {
    results = [
      [{ id: "seat1", userId: "u1", displayName: "Martin" }],
      [{ id: "c1", companyId: "co1", linkedinUrl: "https://linkedin.com/in/nomatch", firstName: "No", lastName: "Match" }],
      [{ profileUrl: "linkedin.com/in/someone-else", displayName: "Else" }],
    ];
    const r = await rematchStoredRelations("t1");
    expect(r).toEqual({ seats: 1, matched: 0, edgesCreated: 0, edgesUpdated: 0, warmSignalsEmitted: 0 });
    expect(buildKnowsFromLinkedInRelations).not.toHaveBeenCalled();
    expect(recordCompanySignal).not.toHaveBeenCalled();
  });
});
