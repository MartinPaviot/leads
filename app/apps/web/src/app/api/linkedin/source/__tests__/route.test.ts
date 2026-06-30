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

// The route does a best-effort warm-path rematch after sourcing — mock it so the
// route test stays focused (rematchStoredRelations has its own test).
vi.mock("@/lib/sending/linkedin/graph-sync", () => ({
  rematchStoredRelations: vi.fn(async () => ({ seats: 1, matched: 0, edgesCreated: 0, edgesUpdated: 0 })),
}));

// ICP→Sales-Nav resolver + TAM preview (#2) — mocked; they have their own unit tests.
const resolveIcpToSalesNavQuery = vi.fn();
const previewSalesNavCount = vi.fn();
vi.mock("@/lib/linkedin/icp-to-salesnav", () => ({
  resolveIcpToSalesNavQuery: (...a: unknown[]) => resolveIcpToSalesNavQuery(...a),
  previewSalesNavCount: (...a: unknown[]) => previewSalesNavCount(...a),
}));

// Jobs/posts search + sourcing — mocked (own unit tests; keeps the canonical
// upsert chain out of this route test).
const resolveJobsQuery = vi.fn();
const buildPostsSearchBody = vi.fn();
vi.mock("@/lib/linkedin/jobs-posts", () => ({
  resolveJobsQuery: (...a: unknown[]) => resolveJobsQuery(...a),
  buildPostsSearchBody: (...a: unknown[]) => buildPostsSearchBody(...a),
}));
const sourceHiringSignals = vi.fn();
const sourcePostAuthors = vi.fn();
vi.mock("@/lib/linkedin/jobs-posts-sourcing", () => ({
  sourceHiringSignals: (...a: unknown[]) => sourceHiringSignals(...a),
  sourcePostAuthors: (...a: unknown[]) => sourcePostAuthors(...a),
}));

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
  resolveIcpToSalesNavQuery.mockResolvedValue({
    body: { api: "sales_navigator", category: "people", industry: { include: [4] } },
    report: [{ type: "INDUSTRY", label: "software", id: "4", matched: "Software Development" }],
    dropped: [],
    usable: true,
  });
  previewSalesNavCount.mockResolvedValue(12480);
  resolveJobsQuery.mockResolvedValue({
    body: { api: "classic", category: "jobs", role: ["592"] },
    report: [{ field: "roles", label: "Head of Sales", id: "592", matched: "Head of Sales" }],
    usable: true,
  });
  buildPostsSearchBody.mockReturnValue({ api: "classic", category: "posts", keywords: "ai" });
  sourceHiringSignals.mockResolvedValue({ jobsScanned: 30, accountsUpserted: 12, signalsRecorded: 18, skippedNoCompany: 0 });
  sourcePostAuthors.mockResolvedValue({ postsScanned: 40, authorsUpserted: 22, engagersSourced: 0, skipped: 5 });
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

  it("resolves ICP criteria to a Sales-Nav body and returns the resolution report (#2)", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    const res = await post({ industries: ["software"], locations: "France, United States", jobTitles: ["Founder"] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.resolution).toHaveLength(1);
    // comma-string -> array parsing reached the resolver
    const icpArg = resolveIcpToSalesNavQuery.mock.calls[0][2];
    expect(icpArg.industries).toEqual(["software"]);
    expect(icpArg.locations).toEqual(["France", "United States"]);
    // the resolved structured body (not url/keywords) is what gets sourced
    expect(sourceFromSalesNav.mock.calls[0][0].query).toMatchObject({ industry: { include: [4] } });
    // hydrateAccounts defaults on so sourced employers aren't name-only
    expect(sourceFromSalesNav.mock.calls[0][0].hydrateAccounts).toBe(true);
  });

  it("parses the full criteria set (structured + spotlights) onto the ICP", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    await post({
      seniorities: ["cxo", "vice_president"],
      companyHeadcount: [{ min: 51, max: 200 }],
      changedJobs: true,
      companies: "Stripe, Datadog",
    });
    const icp = resolveIcpToSalesNavQuery.mock.calls[0][2];
    expect(icp.seniorities).toEqual(["cxo", "vice_president"]);
    expect(icp.companyHeadcount).toEqual([{ min: 51, max: 200 }]);
    expect(icp.changedJobs).toBe(true);
    expect(icp.companies).toEqual(["Stripe", "Datadog"]);
  });

  it("preview mode returns the TAM total without sourcing", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    const res = await post({ industries: ["software"], preview: true });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, preview: true, total: 12480 });
    expect(previewSalesNavCount).toHaveBeenCalledTimes(1);
    expect(sourceFromSalesNav).not.toHaveBeenCalled();
  });

  it("respects hydrateAccounts:false", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    await post({ keywords: "fintech", hydrateAccounts: false });
    expect(sourceFromSalesNav.mock.calls[0][0].hydrateAccounts).toBe(false);
  });

  it("returns dropped-filter notes when the resolver drops invalid structured values", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    resolveIcpToSalesNavQuery.mockResolvedValue({
      body: { api: "sales_navigator", category: "people", seniority: { include: ["cxo"] } },
      report: [],
      dropped: ['seniority "emperor" ignored (not a LinkedIn seniority value)'],
      usable: true,
    });
    const res = await post({ seniorities: ["cxo", "emperor"] });
    const json = await res.json();
    expect(json.dropped).toEqual(['seniority "emperor" ignored (not a LinkedIn seniority value)']);
  });

  it("422 when the ICP criteria resolve to nothing usable", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    resolveIcpToSalesNavQuery.mockResolvedValue({ body: { api: "sales_navigator", category: "people" }, report: [{ type: "JOB_TITLE", label: "wizard", id: null, matched: null }], dropped: [], usable: false });
    const res = await post({ jobTitles: ["wizard"] });
    expect(res.status).toBe(422);
    expect(sourceFromSalesNav).not.toHaveBeenCalled();
  });

  it("category=jobs routes to the hiring-signal sourcer (not sourceFromSalesNav)", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    const res = await post({ category: "jobs", keywords: "revops", roles: ["Head of Sales"] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, accountsUpserted: 12, signalsRecorded: 18 });
    expect(sourceHiringSignals).toHaveBeenCalledTimes(1);
    expect(sourceFromSalesNav).not.toHaveBeenCalled();
    // jobs run on the classic tier even from a Sales-Nav seat
    expect(resolveJobsQuery.mock.calls[0][2]).toMatchObject({ keywords: "revops", roles: ["Head of Sales"] });
  });

  it("category=jobs preview returns the segment total without sourcing", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    const res = await post({ category: "jobs", keywords: "revops", preview: true });
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, preview: true, total: 12480 });
    expect(sourceHiringSignals).not.toHaveBeenCalled();
  });

  it("category=posts sources authors; 400 without a keyword", async () => {
    authed();
    seatRows = [{ id: "a1", status: "connected", unipileAccountId: "acc-1", seatType: "sales_navigator", userId: "u1" }];
    const res = await post({ category: "posts", keywords: "cold outbound", includeEngagers: true });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, authorsUpserted: 22 });
    expect(sourcePostAuthors.mock.calls[0][0]).toMatchObject({ includeEngagers: true });

    buildPostsSearchBody.mockReturnValueOnce({ api: "classic", category: "posts" }); // no keyword
    const res2 = await post({ category: "posts" });
    expect(res2.status).toBe(400);
  });
});
