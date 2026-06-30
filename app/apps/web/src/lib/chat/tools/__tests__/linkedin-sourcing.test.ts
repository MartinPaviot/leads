import { describe, it, expect, vi, beforeEach } from "vitest";

const readUnipileConfig = vi.fn();
vi.mock("@/lib/providers/unipile/http", () => ({ readUnipileConfig: () => readUnipileConfig() }));

const resolveConnectedSeat = vi.fn();
vi.mock("@/lib/linkedin/seat", () => ({
  resolveConnectedSeat: (...a: unknown[]) => resolveConnectedSeat(...a),
  apiForSeat: () => "sales_navigator",
}));

const resolveIcpToSalesNavQuery = vi.fn();
const previewSalesNavCount = vi.fn();
vi.mock("@/lib/linkedin/icp-to-salesnav", () => ({
  resolveIcpToSalesNavQuery: (...a: unknown[]) => resolveIcpToSalesNavQuery(...a),
  previewSalesNavCount: (...a: unknown[]) => previewSalesNavCount(...a),
}));

const sourceFromSalesNav = vi.fn();
vi.mock("@/lib/linkedin/sales-nav-sourcing", () => ({ sourceFromSalesNav: (...a: unknown[]) => sourceFromSalesNav(...a) }));

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

import { buildLinkedInSourcingTools } from "../linkedin-sourcing";

const ctx = { tenantId: "t1", userId: "u1" } as never;
const tools = () => buildLinkedInSourcingTools(ctx);
const run = (name: "previewLinkedInSearch" | "sourceFromLinkedIn", input: unknown) => (tools()[name] as never as { execute: (i: unknown) => Promise<Record<string, unknown>> }).execute(input);

beforeEach(() => {
  vi.clearAllMocks();
  readUnipileConfig.mockReturnValue({ dsn: "d", apiKey: "k" });
  resolveConnectedSeat.mockResolvedValue({ id: "la1", unipileAccountId: "acc-1", seatType: "sales_navigator" });
  resolveIcpToSalesNavQuery.mockResolvedValue({ body: { api: "sales_navigator", category: "people", industry: { include: ["4"] } }, report: [{ type: "INDUSTRY", label: "software", id: "4", matched: "Software Development" }], dropped: [], usable: true });
  previewSalesNavCount.mockResolvedValue(9657);
  sourceFromSalesNav.mockResolvedValue({ searched: 100, accountsUpserted: 40, contactsUpserted: 45, skippedNoIdentity: 5 });
  resolveJobsQuery.mockResolvedValue({ body: { api: "classic", category: "jobs", role: ["592"] }, report: [], usable: true });
  buildPostsSearchBody.mockReturnValue({ api: "classic", category: "posts", keywords: "cold outbound" });
  sourceHiringSignals.mockResolvedValue({ jobsScanned: 30, accountsUpserted: 12, signalsRecorded: 18, skippedNoCompany: 0 });
  sourcePostAuthors.mockResolvedValue({ postsScanned: 40, authorsUpserted: 22, engagersSourced: 8, skipped: 5 });
});

describe("guards", () => {
  it("errors when LinkedIn isn't configured", async () => {
    readUnipileConfig.mockReturnValue(null);
    expect(await run("previewLinkedInSearch", { category: "people", industries: ["software"] })).toMatchObject({ error: expect.stringContaining("isn't configured") });
  });
  it("errors when no seat is connected", async () => {
    resolveConnectedSeat.mockResolvedValue(null);
    expect(await run("sourceFromLinkedIn", { category: "people", keywords: "ai" })).toMatchObject({ error: expect.stringContaining("No connected") });
  });
  it("422-style when nothing resolves to a usable query", async () => {
    resolveIcpToSalesNavQuery.mockResolvedValue({ body: { api: "sales_navigator", category: "people" }, report: [], dropped: [], usable: false });
    expect(await run("sourceFromLinkedIn", { category: "people", titles: ["wizard"] })).toMatchObject({ error: expect.stringContaining("Add at least") });
    expect(sourceFromSalesNav).not.toHaveBeenCalled();
  });
});

describe("previewLinkedInSearch", () => {
  it("returns the TAM total + resolution for an ICP query", async () => {
    const r = await run("previewLinkedInSearch", { category: "people", industries: ["software"], locations: ["France"], seniorities: ["vice_president"] });
    expect(r).toMatchObject({ ok: true, category: "people", total: 9657 });
    // ICP carried the structured filters
    const icp = resolveIcpToSalesNavQuery.mock.calls[0][2];
    expect(icp).toMatchObject({ industries: ["software"], locations: ["France"], seniorities: ["vice_president"] });
    expect(sourceFromSalesNav).not.toHaveBeenCalled();
  });
  it("flags the 2,500 cap", async () => {
    previewSalesNavCount.mockResolvedValue(40000);
    expect((await run("previewLinkedInSearch", { category: "companies", industries: ["software"] })).note).toContain("2,500");
  });
});

describe("sourceFromLinkedIn", () => {
  it("people → sourceFromSalesNav (accounts + contacts)", async () => {
    const r = await run("sourceFromLinkedIn", { category: "people", titles: ["Head of Sales"], companySize: ["51-200"] });
    expect(r).toMatchObject({ ok: true, accounts: 40, contacts: 45 });
    expect(sourceHiringSignals).not.toHaveBeenCalled();
    // companySize bucket mapped to a headcount range on the ICP
    expect(resolveIcpToSalesNavQuery.mock.calls[0][2].companyHeadcount).toEqual([{ min: 51, max: 200 }]);
    expect(resolveIcpToSalesNavQuery.mock.calls[0][2].jobTitles).toEqual(["Head of Sales"]);
  });

  it("jobs → sourceHiringSignals (hiring companies + open roles)", async () => {
    const r = await run("sourceFromLinkedIn", { category: "jobs", titles: ["Head of RevOps"], locations: ["France"] });
    expect(r).toMatchObject({ ok: true, hiringCompanies: 12, openRoles: 18 });
    expect(resolveJobsQuery.mock.calls[0][2]).toMatchObject({ roles: ["Head of RevOps"], locations: ["France"] });
    expect(sourceFromSalesNav).not.toHaveBeenCalled();
  });

  it("posts → sourcePostAuthors, counting authors + engagers", async () => {
    const r = await run("sourceFromLinkedIn", { category: "posts", keywords: "cold outbound", includeEngagers: true });
    expect(r).toMatchObject({ ok: true, contacts: 30 }); // 22 authors + 8 engagers
    expect(sourcePostAuthors.mock.calls[0][0]).toMatchObject({ includeEngagers: true });
  });

  it("posts → 400-style error without a keyword", async () => {
    buildPostsSearchBody.mockReturnValue({ api: "classic", category: "posts" });
    const r = await run("sourceFromLinkedIn", { category: "posts" });
    expect(r).toMatchObject({ error: expect.stringContaining("keyword") });
    expect(sourcePostAuthors).not.toHaveBeenCalled();
  });
});
