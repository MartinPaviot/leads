import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/providers/company-enrichment/waterfall", () => ({ enrichCompany: vi.fn() }));

import { enrichFirmographics, pickFirmographics } from "../apollo-enrich";
import { enrichCompany } from "@/lib/providers/company-enrichment/waterfall";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const company = (over: any = {}): any => ({
  domain: "x.com", name: "X", industry: "SaaS", description: "d", employeeCount: 50,
  sizeRange: "11-50", annualRevenue: null, revenueRange: null, foundedYear: 2019,
  city: "SF", state: "CA", country: "US", technologies: ["Salesforce"], keywords: [],
  fundingStage: "Series A", totalFunding: 5_000_000, linkedinUrl: null, logoUrl: null,
  investors: ["Sequoia"], raw: { secret: "x" }, ...over,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wf = (over: any = {}): any => ({ data: company(), provenance: [], attempts: [], totalCostCents: 0, enriched: true, ...over });

beforeEach(() => vi.clearAllMocks());

describe("enrichFirmographics", () => {
  it("null domain -> null, no waterfall call", async () => {
    expect(await enrichFirmographics({ domain: null, companyName: "X", tenantId: "t" })).toBeNull();
    expect(enrichCompany).not.toHaveBeenCalled();
  });

  it("not enriched -> null", async () => {
    vi.mocked(enrichCompany).mockResolvedValue(wf({ enriched: false }));
    expect(await enrichFirmographics({ domain: "x.com", companyName: "X", tenantId: "t" })).toBeNull();
  });

  it("enriched -> clean facts (no raw) + firmographic-only provenance, tenant passed", async () => {
    vi.mocked(enrichCompany).mockResolvedValue(
      wf({
        provenance: [
          { provider: "apollo", field: "fundingStage", atIso: "t" },
          { provider: "apollo", field: "raw", atIso: "t" }, // not firmographic
          { provider: "clearbit", field: "linkedinUrl", atIso: "t" }, // not firmographic
        ],
      }),
    );
    const r = await enrichFirmographics({ domain: "x.com", companyName: "X", tenantId: "t1" });
    expect(r).not.toBeNull();
    expect(r!.facts).not.toHaveProperty("raw");
    expect(r!.facts.fundingStage).toBe("Series A");
    expect(r!.facts.totalFunding).toBe(5_000_000);
    expect(r!.provenance.map((p) => p.field)).toEqual(["fundingStage"]);
    expect(vi.mocked(enrichCompany)).toHaveBeenCalledWith({ domain: "x.com", name: "X" }, { tenantId: "t1" });
  });
});

describe("pickFirmographics", () => {
  it("drops raw, defaults arrays", () => {
    const f = pickFirmographics(company({ investors: undefined, technologies: undefined }));
    expect(f).not.toHaveProperty("raw");
    expect(f).not.toHaveProperty("keywords");
    expect(f.investors).toEqual([]);
    expect(f.technologies).toEqual([]);
    expect(f.industry).toBe("SaaS");
  });
});
