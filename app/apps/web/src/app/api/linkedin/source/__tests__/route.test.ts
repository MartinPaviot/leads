import { describe, it, expect, vi, beforeEach } from "vitest";

// db.select(...).from(...).where(...).orderBy(...) resolves to `seatRows`.
let seatRows: unknown[] = [];
function makeChain() {
  const c: Record<string, any> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) c[m] = vi.fn(() => c);
  c.then = (res: (v: unknown) => unknown) => res(seatRows);
  return c;
}

vi.mock("@/db", () => ({ db: { select: vi.fn(() => makeChain()) } }));
vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/db/schema", () => ({
  linkedinAccount: { id: "id", tenantId: "tenantId", userId: "userId", status: "status", unipileAccountId: "unipileAccountId", seatType: "seatType", updatedAt: "updatedAt" },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...a: unknown[]) => ({ _and: a })),
  eq: vi.fn((c: unknown, v: unknown) => ({ _eq: [c, v] })),
  desc: vi.fn((c: unknown) => ({ _desc: c })),
}));
vi.mock("@/lib/observability/logger", () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const readUnipileConfig = vi.fn();
vi.mock("@/lib/providers/unipile/http", () => ({ readUnipileConfig: () => readUnipileConfig() }));

const sourceFromSalesNav = vi.fn();
vi.mock("@/lib/linkedin/sales-nav-sourcing", () => ({ sourceFromSalesNav: (...a: unknown[]) => sourceFromSalesNav(...a) }));

import { getAuthContext } from "@/lib/auth/auth-utils";
const route = await import("@/app/api/linkedin/source/route");

const CFG = { dsn: "https://x.unipile.com:1", apiKey: "k" };
const authed = () => vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
const post = (body: unknown) => route.POST(new Request("http://localhost/api/linkedin/source", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  seatRows = [];
  readUnipileConfig.mockReturnValue(CFG);
  sourceFromSalesNav.mockResolvedValue({ searched: 50, accountsUpserted: 40, contactsUpserted: 45, skippedNoIdentity: 5 });
});

describe("POST /api/linkedin/source", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null as never);
    expect((await post({ keywords: "x" })).status).toBe(401);
  });

  it("503 when Unipile is not configured", async () => {
    authed();
    readUnipileConfig.mockReturnValue(null);
    expect((await post({ keywords: "x" })).status).toBe(503);
  });

  it("400 when no connected seat exists", async () => {
    authed();
    seatRows = [{ id: "a1", status: "pending", unipileAccountId: null, seatType: "classic", userId: "u1" }];
    const res = await post({ keywords: "x" });
    expect(res.status).toBe(400);
    expect(sourceFromSalesNav).not.toHaveBeenCalled();
  });

  it("400 when neither url nor keywords is provided", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    expect((await post({})).status).toBe(400);
    expect(sourceFromSalesNav).not.toHaveBeenCalled();
  });

  it("sources with api=sales_navigator for a Sales-Nav seat and returns counts", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    const res = await post({ url: "https://www.linkedin.com/sales/search/people?query=foo" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, accountsUpserted: 40, contactsUpserted: 45 });
    const arg = sourceFromSalesNav.mock.calls[0][0];
    expect(arg.unipileAccountId).toBe("acc-1");
    expect(arg.query.api).toBe("sales_navigator");
    expect(arg.query.url).toContain("/sales/search/people");
  });

  it("falls back to api=classic when the seat is not Sales Navigator", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "classic", userId: "u1" }];
    await post({ keywords: "fintech ceo" });
    expect(sourceFromSalesNav.mock.calls[0][0].query.api).toBe("classic");
  });

  it("502 when sourcing throws", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    sourceFromSalesNav.mockRejectedValue(new Error("unipile down"));
    expect((await post({ keywords: "x" })).status).toBe(502);
  });
});
