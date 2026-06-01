import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetCriteriaIdCounter,
  legacySettingsToCriteria,
  parseSizeLabel,
  sizesToEnvelope,
} from "@/lib/icp/flat-to-criteria";
import { buildCompanyContext } from "@/lib/icp/company-context";
import { computeIcpFit } from "@/lib/icp/criteria-engine";

beforeEach(() => __resetCriteriaIdCounter());

describe("parseSizeLabel", () => {
  it("parses a bounded range", () => {
    expect(parseSizeLabel("51-200")).toEqual({ min: 51, max: 200 });
  });
  it("parses a comma-formatted range", () => {
    expect(parseSizeLabel("501-1,000")).toEqual({ min: 501, max: 1000 });
  });
  it("parses an open-ended top bucket", () => {
    expect(parseSizeLabel("10,001+")).toEqual({ min: 10001, max: null });
  });
});

describe("sizesToEnvelope", () => {
  it("collapses disjoint ranges to the min-max envelope", () => {
    expect(sizesToEnvelope(["11-50", "51-200"])).toEqual({ min: 11, max: 200 });
  });
  it("an open-ended bucket makes max null", () => {
    expect(sizesToEnvelope(["201-500", "10,001+"])).toEqual({ min: 201, max: null });
  });
  it("returns null for empty input", () => {
    expect(sizesToEnvelope([])).toBeNull();
  });
});

describe("legacySettingsToCriteria", () => {
  it("maps all four supported flat fields", () => {
    const criteria = legacySettingsToCriteria({
      targetIndustries: ["Computer Software"],
      targetCompanySizes: ["51-200"],
      targetGeographies: ["France"],
      targetSeniorities: ["C-Suite", "VP"],
    });
    const byField = Object.fromEntries(criteria.map((c) => [c.fieldKey, c]));
    expect(byField.industry.operator).toBe("in");
    expect(byField.industry.value).toEqual(["Computer Software"]);
    expect(byField.employee_count.operator).toBe("between");
    expect(byField.employee_count.value).toEqual({ min: 51, max: 200 });
    expect(byField.geography.value).toEqual(["France"]);
    // seniorities converted to Apollo format
    expect(byField.person_seniorities.value).toEqual(["c_suite", "vp"]);
  });

  it("skips empty / absent fields", () => {
    const criteria = legacySettingsToCriteria({ targetIndustries: ["SaaS"] });
    expect(criteria).toHaveLength(1);
    expect(criteria[0].fieldKey).toBe("industry");
  });

  it("does NOT map targetDepartments (no apollo_search field today)", () => {
    const criteria = legacySettingsToCriteria({
      targetDepartments: ["Engineering", "Security"],
    });
    expect(criteria).toHaveLength(0);
  });

  it("builds all-soft criteria (preserves additive scoring, no hard exclude)", () => {
    const criteria = legacySettingsToCriteria({
      targetIndustries: ["SaaS"],
      targetGeographies: ["US"],
    });
    expect(criteria.every((c) => c.isRequired === false)).toBe(true);
  });

  it("returns empty for a tenant with no targeting at all", () => {
    expect(legacySettingsToCriteria({})).toEqual([]);
  });
});

describe("buildCompanyContext", () => {
  it("reads industry from the column", () => {
    expect(buildCompanyContext({ industry: "Computer Software" }).industry).toBe(
      "Computer Software",
    );
  });

  it("falls back to properties.industry when column is null", () => {
    expect(
      buildCompanyContext({ industry: null, properties: { industry: "Fintech" } }).industry,
    ).toBe("Fintech");
  });

  it("derives employee_count from a size label's low bound", () => {
    expect(buildCompanyContext({ size: "51-200" }).employee_count).toBe(51);
  });

  it("prefers properties.estimated_num_employees over the size label", () => {
    expect(
      buildCompanyContext({ size: "51-200", properties: { estimated_num_employees: 137 } })
        .employee_count,
    ).toBe(137);
  });

  it("maps Apollo enrichment fields from properties", () => {
    const ctx = buildCompanyContext({
      properties: {
        country: "France",
        annual_revenue: 5_000_000,
        technology_names: ["Kubernetes", "React"],
        latest_funding_stage: "Series A",
        total_funding: 12_000_000,
        num_current_job_openings: 8,
        founded_year: 2019,
        investor_names: ["Sequoia"],
      },
    });
    expect(ctx.geography).toBe("France");
    expect(ctx.revenue).toBe(5_000_000);
    expect(ctx.technologies).toEqual(["Kubernetes", "React"]);
    expect(ctx.latest_funding_stage).toBe("Series A");
    expect(ctx.total_funding).toBe(12_000_000);
    expect(ctx.num_open_jobs).toBe(8);
    expect(ctx.founded_year).toBe(2019);
    expect(ctx.investor_names).toEqual(["Sequoia"]);
  });

  it("converts funding date to epoch ms for numeric between", () => {
    const ctx = buildCompanyContext({
      properties: { latest_funding_raised_at: "2026-01-15" },
    });
    expect(ctx.latest_funding_date).toBe(new Date("2026-01-15").getTime());
  });

  it("omits absent fields entirely (exists:false path works)", () => {
    const ctx = buildCompanyContext({ industry: "SaaS" });
    expect("revenue" in ctx).toBe(false);
    expect("technologies" in ctx).toBe(false);
  });

  it("layers extra (custom props / signals) verbatim", () => {
    const ctx = buildCompanyContext(
      { industry: "SaaS" },
      { "signal.funding_recent": true, "properties.nb_avocats": 12 },
    );
    expect(ctx["signal.funding_recent"]).toBe(true);
    expect(ctx["properties.nb_avocats"]).toBe(12);
  });
});

describe("end-to-end: legacy settings → criteria → fit on a company", () => {
  it("a matching company scores high against the Default ICP", () => {
    const criteria = legacySettingsToCriteria({
      targetIndustries: ["Computer Software"],
      targetCompanySizes: ["51-200"],
      targetGeographies: ["France"],
    }).map((c) => ({ ...c })); // already has id

    const ctx = buildCompanyContext({
      industry: "Computer Software",
      size: "51-200",
      properties: { country: "France" },
    });

    const fit = computeIcpFit(criteria, ctx);
    expect(fit.fitScore).toBe(1); // all three soft criteria match
  });

  it("a partial-match company scores the matched fraction", () => {
    const criteria = legacySettingsToCriteria({
      targetIndustries: ["Computer Software"],
      targetGeographies: ["France"],
    });
    const ctx = buildCompanyContext({
      industry: "Computer Software",
      properties: { country: "United States" },
    });
    const fit = computeIcpFit(criteria, ctx);
    expect(fit.fitScore).toBe(0.5); // industry matches, geo doesn't
  });
});
