import { describe, it, expect, vi } from "vitest";
import { detectInvestorOverlap } from "@/lib/tam-stream/signals/investor-overlap";
import { detectFundingRecent } from "@/lib/tam-stream/signals/funding-recent";
import { detectHiringIntent } from "@/lib/tam-stream/signals/hiring-intent";
import { detectYcCompany } from "@/lib/tam-stream/signals/yc-company";
import type { SignalContext } from "@/lib/tam-stream/signals/types";
import type {
  ApolloOrganization,
  OrgSearchOrganization,
} from "@/lib/apollo-client";

// ─── Fixtures ──────────────────────────────────────────────────

function makeSearchOrg(
  overrides: Partial<OrgSearchOrganization> = {},
): OrgSearchOrganization {
  return {
    id: "apollo-1",
    name: "Acme Corp",
    website_url: "https://acme.com",
    linkedin_url: null,
    primary_domain: "acme.com",
    industry: "Software",
    keywords: [],
    estimated_num_employees: 100,
    annual_revenue: null,
    total_funding: null,
    total_funding_printed: null,
    latest_funding_stage: null,
    founded_year: null,
    technology_names: [],
    city: null,
    state: null,
    country: null,
    description: null,
    logo_url: null,
    ...overrides,
  };
}

function makeEnriched(
  overrides: Partial<ApolloOrganization> = {},
): ApolloOrganization {
  return {
    id: "apollo-1",
    name: "Acme Corp",
    website_url: "https://acme.com",
    linkedin_url: null,
    industry: "Software",
    keywords: [],
    estimated_num_employees: 100,
    annual_revenue: null,
    annual_revenue_printed: null,
    total_funding: null,
    total_funding_printed: null,
    latest_funding_stage: null,
    latest_funding_raised_at: null,
    founded_year: null,
    technology_names: [],
    city: null,
    state: null,
    country: null,
    description: null,
    ...overrides,
  };
}

const FROZEN_NOW = new Date("2026-04-21T00:00:00Z");

function makeCtx(overrides: Partial<SignalContext> = {}): SignalContext {
  return {
    tenantId: "tenant-1",
    tenantInvestors: new Set(),
    icp: {},
    now: FROZEN_NOW,
    ...overrides,
  };
}

// ─── investor_overlap ─────────────────────────────────────────

describe("detectInvestorOverlap", () => {
  it("returns indeterminate when target has no investor data", async () => {
    const r = await detectInvestorOverlap(
      { search: makeSearchOrg(), enriched: makeEnriched() },
      makeCtx({ tenantInvestors: new Set(["sequoia capital"]) }),
    );
    expect(r.value).toBe(false);
    expect(r.confidence).toBe("indeterminate");
    expect(r.sources).toEqual([]);
  });

  it("returns indeterminate when tenant has no cap table", async () => {
    const r = await detectInvestorOverlap(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({ investor_names: ["Sequoia Capital"] }),
      },
      makeCtx({ tenantInvestors: new Set() }),
    );
    expect(r.value).toBe(false);
    expect(r.confidence).toBe("indeterminate");
    expect(r.reason).toMatch(/investor list is empty/i);
  });

  it("returns value=false when no overlap", async () => {
    const r = await detectInvestorOverlap(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({ investor_names: ["Sequoia Capital"] }),
      },
      makeCtx({ tenantInvestors: new Set(["a16z", "founders fund"]) }),
    );
    expect(r.value).toBe(false);
    expect(r.confidence).toBe("high");
  });

  it("matches case-insensitively and lists shared investors", async () => {
    const r = await detectInvestorOverlap(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({
          investor_names: ["Sequoia Capital", "Founders Fund", "Some Other Fund"],
        }),
      },
      makeCtx({
        tenantInvestors: new Set(["sequoia capital", "founders fund"]),
      }),
    );
    expect(r.value).toBe(true);
    expect(r.confidence).toBe("high");
    expect(r.reason).toMatch(/Sequoia Capital/);
    expect(r.reason).toMatch(/Founders Fund/);
    expect(r.sources).toHaveLength(2);
    // Sources are unverified at the detector boundary (HEAD-check runs
    // in the pipeline layer).
    expect(r.sources.every((s) => s.verified === false)).toBe(true);
  });

  it("caps sources at 3 entries even with many overlaps", async () => {
    const investors = ["A Fund", "B Fund", "C Fund", "D Fund", "E Fund"];
    const r = await detectInvestorOverlap(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({ investor_names: investors }),
      },
      makeCtx({ tenantInvestors: new Set(investors.map((s) => s.toLowerCase())) }),
    );
    expect(r.sources.length).toBeLessThanOrEqual(3);
  });
});

// ─── funding_recent ───────────────────────────────────────────

describe("detectFundingRecent", () => {
  it("returns indeterminate when no funding date on file", async () => {
    const r = await detectFundingRecent(
      { search: makeSearchOrg(), enriched: makeEnriched() },
      makeCtx(),
    );
    expect(r.value).toBe(false);
    expect(r.confidence).toBe("indeterminate");
  });

  it("returns true for a round raised 30 days ago", async () => {
    const thirtyDaysAgo = new Date(FROZEN_NOW);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const r = await detectFundingRecent(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({
          latest_funding_raised_at: thirtyDaysAgo.toISOString(),
          latest_funding_stage: "Series A",
          total_funding_printed: "$15M",
        }),
      },
      makeCtx(),
    );
    expect(r.value).toBe(true);
    expect(r.confidence).toBe("high");
    expect(r.reason).toMatch(/Raised/);
    expect(r.reason).toMatch(/Series A/);
    expect(r.reason).toMatch(/\$15M/);
    expect(r.sources).toHaveLength(1);
  });

  it("returns false for a round raised > 180 days ago", async () => {
    const oldDate = new Date(FROZEN_NOW);
    oldDate.setDate(oldDate.getDate() - 365);
    const r = await detectFundingRecent(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({
          latest_funding_raised_at: oldDate.toISOString(),
          latest_funding_stage: "Seed",
        }),
      },
      makeCtx(),
    );
    expect(r.value).toBe(false);
    expect(r.confidence).toBe("high");
    expect(r.reason).toMatch(/365 days ago/);
  });

  it("returns indeterminate on a malformed date", async () => {
    const r = await detectFundingRecent(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({
          latest_funding_raised_at: "not-a-date",
        }),
      },
      makeCtx(),
    );
    expect(r.value).toBe(false);
    expect(r.confidence).toBe("indeterminate");
  });

  it("boundary: round raised exactly today is still recent", async () => {
    const r = await detectFundingRecent(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({
          latest_funding_raised_at: FROZEN_NOW.toISOString(),
        }),
      },
      makeCtx(),
    );
    expect(r.value).toBe(true);
  });
});

// ─── hiring_intent ────────────────────────────────────────────

describe("detectHiringIntent", () => {
  it("returns indeterminate when Apollo has no job-posting data", async () => {
    const r = await detectHiringIntent(
      { search: makeSearchOrg(), enriched: makeEnriched() },
      makeCtx(),
    );
    expect(r.value).toBe(false);
    expect(r.confidence).toBe("indeterminate");
    expect(r.reason).toMatch(/no job-posting data/i);
  });

  it("returns false with high confidence when count is 0", async () => {
    const r = await detectHiringIntent(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({ num_current_job_openings: 0 }),
      },
      makeCtx(),
    );
    expect(r.value).toBe(false);
    expect(r.confidence).toBe("high");
  });

  it("returns true with count and careers/jobs sources when hiring", async () => {
    const r = await detectHiringIntent(
      {
        search: makeSearchOrg({ primary_domain: "acme.com" }),
        enriched: makeEnriched({ num_current_job_openings: 17 }),
      },
      makeCtx(),
    );
    expect(r.value).toBe(true);
    expect(r.confidence).toBe("high");
    expect(r.reason).toMatch(/17 active job postings/);
    expect(r.sources).toHaveLength(2);
    expect(r.sources[0].url).toBe("https://acme.com/careers");
    expect(r.sources[1].url).toBe("https://acme.com/jobs");
  });

  it("pluralisation: 1 vs many postings", async () => {
    const one = await detectHiringIntent(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({ num_current_job_openings: 1 }),
      },
      makeCtx(),
    );
    expect(one.reason).toBe("1 active job posting");

    const many = await detectHiringIntent(
      {
        search: makeSearchOrg(),
        enriched: makeEnriched({ num_current_job_openings: 42 }),
      },
      makeCtx(),
    );
    expect(many.reason).toBe("42 active job postings");
  });

  it("omits URL sources when domain is unknown", async () => {
    const r = await detectHiringIntent(
      {
        search: makeSearchOrg({ primary_domain: null, website_url: null }),
        enriched: makeEnriched({ num_current_job_openings: 3 }),
      },
      makeCtx(),
    );
    expect(r.value).toBe(true);
    expect(r.sources).toEqual([]);
  });
});

// ─── yc_company ───────────────────────────────────────────────

describe("detectYcCompany", () => {
  it("detects explicit 'Y Combinator' mention in description", async () => {
    const r = await detectYcCompany(
      {
        search: makeSearchOrg({
          description: "Launched out of Y Combinator S19. We build dev tools.",
        }),
        enriched: null,
      },
      makeCtx(),
    );
    expect(r.value).toBe(true);
    expect(r.confidence).toBe("medium");
    expect(r.sources[0].url).toMatch(/ycombinator\.com\/companies\?query=/);
  });

  it("detects batch code alone when combined with YC phrase", async () => {
    const r = await detectYcCompany(
      {
        search: makeSearchOrg({
          description: "YC W22 company building the future of SaaS.",
          keywords: [],
        }),
        enriched: null,
      },
      makeCtx(),
    );
    expect(r.value).toBe(true);
    expect(r.reason).toMatch(/batch W22/i);
  });

  it("detects 'YC backed' tight phrase without explicit batch", async () => {
    const r = await detectYcCompany(
      {
        search: makeSearchOrg({
          description: "A YC-backed startup in fintech.",
        }),
        enriched: null,
      },
      makeCtx(),
    );
    expect(r.value).toBe(true);
  });

  it("rejects unrelated 'S 20% off' false positive", async () => {
    const r = await detectYcCompany(
      {
        search: makeSearchOrg({
          description: "Get S 20% off on your first purchase.",
          keywords: [],
        }),
        enriched: null,
      },
      makeCtx(),
    );
    expect(r.value).toBe(false);
  });

  it("reads from keywords when description is silent", async () => {
    const r = await detectYcCompany(
      {
        search: makeSearchOrg({
          description: "We do things.",
          keywords: ["saas", "y combinator alumni", "analytics"],
        }),
        enriched: null,
      },
      makeCtx(),
    );
    expect(r.value).toBe(true);
  });

  it("returns false cleanly when nothing matches", async () => {
    const r = await detectYcCompany(
      {
        search: makeSearchOrg({
          description: "Enterprise software for HR departments.",
          keywords: ["hr", "workflow"],
        }),
        enriched: null,
      },
      makeCtx(),
    );
    expect(r.value).toBe(false);
    expect(r.confidence).toBe("high");
    expect(r.reason).toMatch(/No Y Combinator mention/i);
  });
});
