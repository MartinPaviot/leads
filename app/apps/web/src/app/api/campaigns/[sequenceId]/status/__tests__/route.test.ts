import { describe, it, expect, vi, beforeEach } from "vitest";

// Thenable chain: resolves on .limit()/.groupBy() or when awaited at .where().
// Call order for a launched campaign: sequence(.limit), contactPreview(.limit),
// status counts(.groupBy), engagement(await at .where).
function makeChain(results: unknown[]) {
  let i = 0;
  const c: Record<string, any> = {};
  const resolve = () => { const r = results[i] ?? []; i++; return Promise.resolve(r); };
  for (const m of ["from", "where", "innerJoin", "leftJoin", "orderBy"]) c[m] = () => c;
  c.limit = () => resolve();
  c.groupBy = () => resolve();
  c.then = (cb: any) => resolve().then(cb);
  return c;
}

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/db/schema", () => ({
  sequences: { id: "s.id", tenantId: "s.tenantId", campaignConfig: "s.cfg" },
  sequenceEnrollments: { contactId: "se.contactId", sequenceId: "se.sequenceId" },
  contacts: { id: "c.id", firstName: "c.fn", lastName: "c.ln", email: "c.e", title: "c.t", score: "c.s", companyId: "c.coid" },
  companies: { id: "co.id", name: "co.name", domain: "co.domain" },
  outboundEmails: { tenantId: "oe.tenantId", campaignId: "oe.campaignId", status: "oe.status", openedAt: "oe.openedAt", repliedAt: "oe.repliedAt" },
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn(), sql: Object.assign(() => ({}), { raw: () => ({}) }) }));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const route = await import("@/app/api/campaigns/[sequenceId]/status/route");
const ctx = { params: Promise.resolve({ sequenceId: "seq-1" }) };

describe("GET /api/campaigns/[sequenceId]/status — emailStats opened/replied (P1 13)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for an unknown / cross-tenant sequence", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    vi.mocked(db.select).mockReturnValue(makeChain([[]]) as never); // sequence not found
    const res = await route.GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(404);
  });

  it("includes real opened/replied engagement counts for a launched campaign", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    vi.mocked(db.select).mockReturnValue(makeChain([
      [{ id: "seq-1", tenantId: "t1", campaignConfig: { status: "launched", stats: {} } }], // sequence
      [], // contactPreview
      [{ status: "sent", count: 5 }], // status counts
      [{ opened: 3, replied: 1 }], // engagement
    ]) as never);

    const res = await route.GET(new Request("http://localhost"), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.emailStats.opened).toBe(3);
    expect(data.emailStats.replied).toBe(1);
    expect(data.emailStats.sent).toBe(5);
  });
});
