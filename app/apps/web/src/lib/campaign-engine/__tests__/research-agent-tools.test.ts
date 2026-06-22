import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/campaign-engine/sources/website", () => ({ scrapeCompanyWebsite: vi.fn() }));
vi.mock("@/lib/campaign-engine/sources/jobs", () => ({ scrapeJobPostings: vi.fn() }));
vi.mock("@/lib/campaign-engine/sources/news", () => ({ fetchRecentNews: vi.fn() }));
vi.mock("@/lib/campaign-engine/sources/tech-stack", () => ({ detectTechStack: vi.fn() }));
vi.mock("@/lib/campaign-engine/sources/browse-page", () => ({ browsePage: vi.fn() }));

import { buildResearchTools, newToolLedger } from "../research-agent-tools";
import { scrapeCompanyWebsite } from "../sources/website";
import { fetchRecentNews } from "../sources/news";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const exec = (t: any) => t.execute({}, { toolCallId: "1", messages: [] });

beforeEach(() => vi.clearAllMocks());

describe("buildResearchTools — conditional registration", () => {
  it("with a domain: all source tools; news only without a domain", () => {
    const withDomain = buildResearchTools({ rootDomain: "x.com", companyName: "X" }, newToolLedger());
    expect(Object.keys(withDomain).sort()).toEqual(["browsePage", "detectTechStack", "fetchJobs", "fetchNews", "fetchWebsite"]);

    const noDomain = buildResearchTools({ rootDomain: null, companyName: "X" }, newToolLedger());
    expect(Object.keys(noDomain)).toEqual(["fetchNews"]);
  });

  it("enrichApollo only when the impl is provided (no trompe-l'oeil stub)", () => {
    expect("enrichApollo" in buildResearchTools({ rootDomain: "x.com", companyName: "X" }, newToolLedger())).toBe(false);
    const withApollo = buildResearchTools(
      { rootDomain: "x.com", companyName: "X", enrichApollo: async () => null },
      newToolLedger(),
    );
    expect("enrichApollo" in withApollo).toBe(true);
  });
});

describe("enrichApollo — P1-10 firmographics capture into the ledger", () => {
  it("success stores facts+provenance into ledger.collected.firmographics", async () => {
    const facts = {
      industry: "SaaS", description: null, employeeCount: 120, sizeRange: null,
      annualRevenue: null, revenueRange: null, foundedYear: 2019, city: "SF",
      state: "CA", country: "US", fundingStage: "Series B", totalFunding: 30_000_000,
      investors: ["Sequoia"], technologies: ["React"],
    };
    const provenance = [{ field: "employeeCount" as const, provider: "apollo", atIso: "2026-01-01" }];
    const ledger = newToolLedger();
    const tools = buildResearchTools(
      { rootDomain: "x.com", companyName: "X", enrichApollo: async () => ({ facts, provenance }) },
      ledger,
    );
    const r = await exec(tools.enrichApollo);
    expect(r).toMatchObject({ ok: true });
    expect(ledger.collected.firmographics).toEqual({ facts, provenance });
    expect(ledger.succeeded).toBe(1);
  });

  it("null result leaves ledger.collected.firmographics null (no provider hit)", async () => {
    const ledger = newToolLedger();
    const tools = buildResearchTools(
      { rootDomain: "x.com", companyName: "X", enrichApollo: async () => null },
      ledger,
    );
    const r = await exec(tools.enrichApollo);
    expect(r.ok).toBe(false);
    expect(ledger.collected.firmographics).toBeNull();
  });
});

describe("tool execute — fail-soft, collect, memoise", () => {
  it("source throws → { ok:false } + ledger.error, never throws", async () => {
    vi.mocked(scrapeCompanyWebsite).mockRejectedValue(new Error("boom"));
    const ledger = newToolLedger();
    const tools = buildResearchTools({ rootDomain: "x.com", companyName: "X" }, ledger);
    const r = await exec(tools.fetchWebsite);
    expect(r.ok).toBe(false);
    expect(ledger.errors.some((e) => e.source === "website")).toBe(true);
    expect(ledger.attempted).toBe(1);
    expect(ledger.succeeded).toBe(0);
  });

  it("success collects into the ledger", async () => {
    const site = { rawText: "hi", metaDescription: null, headings: [], fetchedAt: "t" };
    vi.mocked(scrapeCompanyWebsite).mockResolvedValue(site);
    const ledger = newToolLedger();
    const tools = buildResearchTools({ rootDomain: "x.com", companyName: "X" }, ledger);
    const r = await exec(tools.fetchWebsite);
    expect(r).toMatchObject({ ok: true });
    expect(ledger.collected.website).toEqual(site);
    expect(ledger.succeeded).toBe(1);
  });

  it("memoised: a 2nd identical call does not refetch and does not re-increment attempted", async () => {
    vi.mocked(fetchRecentNews).mockResolvedValue([]);
    const ledger = newToolLedger();
    const tools = buildResearchTools({ rootDomain: "x.com", companyName: "X" }, ledger);
    await exec(tools.fetchNews);
    await exec(tools.fetchNews);
    expect(vi.mocked(fetchRecentNews)).toHaveBeenCalledTimes(1);
    expect(ledger.attempted).toBe(1);
  });
});
