import { describe, expect, it } from "vitest";
import {
  STANDARD_FIELDS,
  apolloSearchFieldKeys,
  getStandardField,
  standardCatalogSeedRows,
} from "@/lib/icp/field-catalog";

describe("STANDARD_FIELDS — Apollo anchoring", () => {
  it("every apollo_search field declares an apolloParam", () => {
    for (const f of STANDARD_FIELDS) {
      if (f.source === "apollo_search") {
        expect(f.apolloParam, `field ${f.fieldKey}`).toBeTruthy();
      }
    }
  });

  it("apollo_enrich fields do NOT declare an apolloParam (not pushable to search)", () => {
    for (const f of STANDARD_FIELDS) {
      if (f.source === "apollo_enrich") {
        expect(f.apolloParam, `field ${f.fieldKey}`).toBeUndefined();
      }
    }
  });

  it("apolloParam values are real Apollo search keys (verbatim from apollo-client.ts)", () => {
    // Guard against drift: these are the exact OrgSearchParams / people
    // search keys. If apollo-client.ts renames a param, this list must
    // be updated in lockstep.
    const realApolloParams = new Set([
      "q_organization_keyword_tags",
      "organization_num_employees_ranges",
      "organization_locations",
      "organization_not_locations",
      "revenue_range",
      "currently_using_any_of_technology_uids",
      "latest_funding_date_range",
      "total_funding_range",
      "organization_num_jobs_range",
      "q_organization_job_titles",
      "person_titles",
      "person_seniorities",
    ]);
    for (const f of STANDARD_FIELDS) {
      if (f.apolloParam) {
        expect(realApolloParams.has(f.apolloParam), `${f.fieldKey} → ${f.apolloParam}`).toBe(true);
      }
    }
  });

  it("every field declares at least one operator", () => {
    for (const f of STANDARD_FIELDS) {
      expect(f.operators.length, `field ${f.fieldKey}`).toBeGreaterThan(0);
    }
  });

  it("field keys are unique", () => {
    const keys = STANDARD_FIELDS.map((f) => f.fieldKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("getStandardField", () => {
  it("finds a known field", () => {
    expect(getStandardField("employee_count")?.apolloParam).toBe(
      "organization_num_employees_ranges",
    );
  });
  it("returns undefined for an unknown field", () => {
    expect(getStandardField("nonexistent_field")).toBeUndefined();
  });
});

describe("apolloSearchFieldKeys", () => {
  it("returns only the pushable-to-search fields", () => {
    const keys = apolloSearchFieldKeys();
    expect(keys).toContain("industry");
    expect(keys).toContain("employee_count");
    expect(keys).toContain("technologies");
    // enrich-only fields excluded
    expect(keys).not.toContain("latest_funding_stage");
    expect(keys).not.toContain("founded_year");
    expect(keys).not.toContain("investor_names");
  });
});

describe("standardCatalogSeedRows", () => {
  it("produces one seed row per standard field", () => {
    expect(standardCatalogSeedRows().length).toBe(STANDARD_FIELDS.length);
  });
  it("nulls apolloParam for enrich-only fields", () => {
    const founded = standardCatalogSeedRows().find((r) => r.fieldKey === "founded_year");
    expect(founded?.apolloParam).toBeNull();
  });
  it("carries the apolloParam for search fields", () => {
    const emp = standardCatalogSeedRows().find((r) => r.fieldKey === "employee_count");
    expect(emp?.apolloParam).toBe("organization_num_employees_ranges");
  });
});
