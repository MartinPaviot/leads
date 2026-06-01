import { describe, expect, it } from "vitest";
import { criteriaToApolloParams } from "@/lib/icp/to-apollo-params";
import type { Criterion } from "@/lib/icp/criteria-engine";

function crit(p: Partial<Criterion> & Pick<Criterion, "fieldKey" | "operator">): Criterion {
  return {
    id: p.id ?? `${p.fieldKey}-${p.operator}`,
    value: p.value ?? null,
    weight: p.weight ?? 1,
    isRequired: p.isRequired ?? false,
    ...p,
  };
}

describe("criteriaToApolloParams — array params", () => {
  it("maps industry in → q_organization_keyword_tags", () => {
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "industry", operator: "in", value: ["Computer Software", "Internet"] }),
    ]);
    expect(params.q_organization_keyword_tags).toEqual(["Computer Software", "Internet"]);
  });

  it("maps geography in → organization_locations", () => {
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "geography", operator: "in", value: ["France", "Switzerland"] }),
    ]);
    expect(params.organization_locations).toEqual(["France", "Switzerland"]);
  });

  it("maps technologies in → currently_using_any_of_technology_uids (slug UIDs)", () => {
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "technologies", operator: "in", value: ["Datadog", "New Relic", "MongoDB Atlas"] }),
    ]);
    // Display names normalised to Apollo slug UIDs.
    expect(params.currently_using_any_of_technology_uids).toEqual(["datadog", "new_relic", "mongodb"]);
  });

  it("unions two criteria targeting the same param (industry + keywords both → keyword_tags)", () => {
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "industry", operator: "in", value: ["SaaS"] }),
      crit({ fieldKey: "keywords", operator: "in", value: ["devops", "SaaS"] }),
    ]);
    expect(params.q_organization_keyword_tags?.sort()).toEqual(["SaaS", "devops"].sort());
  });
});

describe("criteriaToApolloParams — employee ranges", () => {
  it("maps employee_count between → Apollo range 'min,max'", () => {
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "employee_count", operator: "between", value: { min: 51, max: 200 } }),
    ]);
    expect(params.organization_num_employees_ranges).toEqual(["51,200"]);
  });

  it("open-ended max → 'min,'", () => {
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "employee_count", operator: "between", value: { min: 1000 } }),
    ]);
    expect(params.organization_num_employees_ranges).toEqual(["1000,"]);
  });

  it("gte degrades to a one-sided employee range", () => {
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "employee_count", operator: "gte", value: 50 }),
    ]);
    expect(params.organization_num_employees_ranges).toEqual(["50,"]);
  });
});

describe("criteriaToApolloParams — numeric range objects", () => {
  it("maps revenue between → revenue_range {min,max}", () => {
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "revenue", operator: "between", value: { min: 1_000_000, max: 50_000_000 } }),
    ]);
    expect(params.revenue_range).toEqual({ min: 1_000_000, max: 50_000_000 });
  });

  it("maps total_funding gte → total_funding_range {min}", () => {
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "total_funding", operator: "gte", value: 5_000_000 }),
    ]);
    expect(params.total_funding_range).toEqual({ min: 5_000_000 });
  });

  it("maps num_open_jobs between → organization_num_jobs_range", () => {
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "num_open_jobs", operator: "between", value: { min: 1 } }),
    ]);
    expect(params.organization_num_jobs_range).toEqual({ min: 1 });
  });
});

describe("criteriaToApolloParams — date range", () => {
  it("maps latest_funding_date between (epoch ms) → ISO range", () => {
    const min = new Date("2026-01-01").getTime();
    const max = new Date("2026-06-01").getTime();
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "latest_funding_date", operator: "between", value: { min, max } }),
    ]);
    expect(params.latest_funding_date_range?.min).toBe(new Date(min).toISOString());
    expect(params.latest_funding_date_range?.max).toBe(new Date(max).toISOString());
  });

  it("maps latest_funding_date gte (epoch ms) → ISO min only", () => {
    const min = new Date("2026-01-01").getTime();
    const { params } = criteriaToApolloParams([
      crit({ fieldKey: "latest_funding_date", operator: "gte", value: min }),
    ]);
    expect(params.latest_funding_date_range?.min).toBe(new Date(min).toISOString());
    expect(params.latest_funding_date_range?.max).toBeUndefined();
  });
});

describe("criteriaToApolloParams — post-filter (non-search criteria)", () => {
  it("apollo_enrich fields do NOT translate, land in postFilter", () => {
    const { params, postFilterCriterionIds } = criteriaToApolloParams([
      crit({ id: "fs", fieldKey: "latest_funding_stage", operator: "in", value: ["series_a"] }),
      crit({ id: "fy", fieldKey: "founded_year", operator: "gte", value: 2018 }),
    ]);
    expect(Object.keys(params)).toHaveLength(0);
    expect(postFilterCriterionIds.sort()).toEqual(["fs", "fy"].sort());
  });

  it("unknown / custom field lands in postFilter", () => {
    const { postFilterCriterionIds } = criteriaToApolloParams([
      crit({ id: "x", fieldKey: "properties.nb_avocats", operator: "gte", value: 5 }),
    ]);
    expect(postFilterCriterionIds).toEqual(["x"]);
  });

  it("person_* criteria post-filter (not on OrgSearchParams)", () => {
    const { postFilterCriterionIds } = criteriaToApolloParams([
      crit({ id: "pt", fieldKey: "person_titles", operator: "in", value: ["CTO"] }),
    ]);
    expect(postFilterCriterionIds).toContain("pt");
  });

  it("mixes: search criteria translate, enrich criteria post-filter", () => {
    const { params, postFilterCriterionIds } = criteriaToApolloParams([
      crit({ id: "ind", fieldKey: "industry", operator: "in", value: ["SaaS"] }),
      crit({ id: "fy", fieldKey: "founded_year", operator: "gte", value: 2018 }),
    ]);
    expect(params.q_organization_keyword_tags).toEqual(["SaaS"]);
    expect(postFilterCriterionIds).toEqual(["fy"]);
  });
});
