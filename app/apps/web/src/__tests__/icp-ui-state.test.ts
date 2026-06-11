import { describe, it, expect } from "vitest";
import {
  uiStateToCriteria,
  criteriaToUiState,
  splitCriteria,
  mirrorFromUiState,
  coveringSizeLabels,
  parseUiState,
  parseSourcingFilters,
  EMPTY_UI_STATE,
  EMPTY_SOURCING_FILTERS,
  type IcpUiState,
} from "@/lib/icp/ui-state";
import { validateIcpInput, type CatalogEntry } from "@/lib/icp/validation";

/**
 * Phase 1 (_specs/icp-unification R5/D4): uiState is the editor's
 * source of truth; criteria are regenerated from it at save; the flat
 * tenants.settings mirror derives from it. These tests lock the
 * round-trip, the importance mapping (R4.4), the Advanced split and
 * the R5.2 mirror key list.
 */

const FULL_UI: IcpUiState = {
  industries: ["Hospital & Health Care", "Nonprofit Organization Management"],
  companySizes: ["51-200", "201-500", "501-1,000"],
  geographies: ["Vaud", "Geneva"],
  revenueMin: 1_000_000,
  revenueMax: null,
  technologies: ["WordPress"],
  keywords: ["fondation"],
  totalFundingMin: null,
  totalFundingMax: 5_000_000,
  minJobOpenings: 2,
  hiringTitles: ["Account Executive"],
  seniorities: ["C-Suite", "Founder"],
  personTitles: ["CEO", "Directeur"],
  importance: { industries: "important", geographies: "must", technologies: "nice" },
};

describe("uiStateToCriteria — generation + importance mapping (R4.4)", () => {
  const criteria = uiStateToCriteria(FULL_UI);
  const byKey = new Map(criteria.map((c) => [c.fieldKey, c]));

  it("emits one criterion per filled section", () => {
    expect([...byKey.keys()].sort()).toEqual(
      [
        "industry", "employee_count", "geography", "revenue", "technologies",
        "keywords", "total_funding", "num_open_jobs", "hiring_job_titles",
        "person_seniorities", "person_titles",
      ].sort(),
    );
  });

  it("maps importance: important → w3, nice → w1, must → isRequired", () => {
    expect(byKey.get("industry")).toMatchObject({ weight: 3, isRequired: false });
    expect(byKey.get("technologies")).toMatchObject({ weight: 1, isRequired: false });
    expect(byKey.get("geography")).toMatchObject({ isRequired: true });
  });

  it("applies the strong defaults when importance is unset (sizes → important, keywords → nice)", () => {
    expect(byKey.get("employee_count")).toMatchObject({ weight: 3 });
    expect(byKey.get("keywords")).toMatchObject({ weight: 1 });
  });

  it("collapses size labels to their envelope for scoring", () => {
    expect(byKey.get("employee_count")?.value).toEqual({ min: 51, max: 1000 });
  });

  it("converts seniorities to Apollo format", () => {
    expect(byKey.get("person_seniorities")?.value).toEqual(["c_suite", "founder"]);
  });

  it("emits nothing for an empty state", () => {
    expect(uiStateToCriteria(EMPTY_UI_STATE)).toEqual([]);
  });
});

describe("criteriaToUiState — lossy adoption (AI candidates, pre-Phase-1 rows)", () => {
  it("round-trips the guided sections", () => {
    const { uiState, advanced } = criteriaToUiState(uiStateToCriteria(FULL_UI));
    expect(advanced).toEqual([]);
    expect(uiState.industries).toEqual(FULL_UI.industries);
    expect(uiState.geographies).toEqual(FULL_UI.geographies);
    expect(uiState.companySizes).toEqual(FULL_UI.companySizes); // envelope 101-1000 → exact covering labels
    expect(uiState.importance.geographies).toBe("must");
    expect(uiState.importance.industries).toBe("important");
    expect(uiState.seniorities).toEqual(["C-Suite", "Founder"]);
  });

  it("keeps non-guided criteria as Advanced", () => {
    const { advanced } = criteriaToUiState([
      { fieldKey: "latest_funding_stage", operator: "in", value: ["seed"], weight: 1, isRequired: false },
      { fieldKey: "industry", operator: "in", value: ["Banking"], weight: 1, isRequired: false },
    ]);
    expect(advanced).toHaveLength(1);
    expect(advanced[0].fieldKey).toBe("latest_funding_stage");
  });

  it("keeps an envelope no whole label fits as Advanced instead of widening", () => {
    const { uiState, advanced } = criteriaToUiState([
      { fieldKey: "employee_count", operator: "between", value: { min: 30, max: 40 }, weight: 1, isRequired: false },
    ]);
    expect(uiState.companySizes).toEqual([]);
    expect(advanced).toHaveLength(1);
  });
});

describe("splitCriteria — Advanced rendering rule (R4.6/R4.7)", () => {
  const criteria = [
    { fieldKey: "industry", operator: "in" },
    { fieldKey: "latest_funding_stage", operator: "in" },
  ];
  it("with uiState: guided slots go to widgets, the rest to Advanced", () => {
    const { guided, advanced } = splitCriteria(criteria, true);
    expect(guided.map((c) => c.fieldKey)).toEqual(["industry"]);
    expect(advanced.map((c) => c.fieldKey)).toEqual(["latest_funding_stage"]);
  });
  it("without uiState: EVERYTHING is Advanced (graceful degradation)", () => {
    const { guided, advanced } = splitCriteria(criteria, false);
    expect(guided).toEqual([]);
    expect(advanced).toHaveLength(2);
  });
});

describe("mirrorFromUiState — the R5.2 flat key list", () => {
  it("writes every legacy key the 25 flat readers consume", () => {
    const mirror = mirrorFromUiState(FULL_UI, {
      excludeGeographies: ["France"],
      fundingRecencyDays: 180,
    });
    expect(mirror).toEqual({
      targetIndustries: FULL_UI.industries,
      targetCompanySizes: FULL_UI.companySizes,
      targetGeographies: FULL_UI.geographies,
      targetSeniorities: FULL_UI.seniorities,
      targetRoles: "CEO, Directeur",
      targetKeywords: FULL_UI.keywords,
      targetTechnologies: FULL_UI.technologies,
      targetRevenueMin: 1_000_000,
      targetRevenueMax: null,
      totalFundingMin: null,
      totalFundingMax: 5_000_000,
      minJobOpenings: 2,
      hiringTitles: FULL_UI.hiringTitles,
      excludeGeographies: ["France"],
      fundingRecencyDays: 180,
    });
  });
});

describe("coveringSizeLabels — strictly-inside inverse", () => {
  it("returns the labels fully inside the envelope", () => {
    expect(coveringSizeLabels(51, 1000)).toEqual(["51-200", "201-500", "501-1,000"]);
  });
  it("never widens (open-ended top bucket only when max is open)", () => {
    expect(coveringSizeLabels(51, 500)).toEqual(["51-200", "201-500"]);
    expect(coveringSizeLabels(5001, null)).toEqual(["5,001-10,000", "10,001+"]);
  });
});

describe("parseUiState / parseSourcingFilters — shape guard (R5.5)", () => {
  it("rejects unknown uiState keys", () => {
    const r = parseUiState({ industries: [], bogus: 1 });
    expect(r.ok).toBe(false);
  });
  it("rejects wrong types", () => {
    expect(parseUiState({ industries: "SaaS" }).ok).toBe(false);
    expect(parseUiState({ revenueMin: "1m" }).ok).toBe(false);
    expect(parseUiState({ importance: { industries: "critical" } }).ok).toBe(false);
    expect(parseSourcingFilters({ excludeGeographies: [1] }).ok).toBe(false);
  });
  it("normalizes a partial payload with defaults", () => {
    const r = parseUiState({ industries: ["Banking"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.industries).toEqual(["Banking"]);
      expect(r.value.companySizes).toEqual([]);
      expect(r.value.revenueMin).toBeNull();
    }
  });
});

describe("validateIcpInput — uiState integration", () => {
  const CATALOG: CatalogEntry[] = [
    { fieldKey: "industry", operators: ["in", "eq"], valueType: "multi_select" },
    { fieldKey: "employee_count", operators: ["between", "gte", "lte"], valueType: "range" },
    { fieldKey: "geography", operators: ["in"], valueType: "multi_select" },
    { fieldKey: "revenue", operators: ["between", "gte", "lte"], valueType: "range" },
    { fieldKey: "technologies", operators: ["in", "contains"], valueType: "multi_select" },
    { fieldKey: "keywords", operators: ["in", "contains"], valueType: "multi_select" },
    { fieldKey: "total_funding", operators: ["between", "gte", "lte"], valueType: "range" },
    { fieldKey: "num_open_jobs", operators: ["between", "gte"], valueType: "range" },
    { fieldKey: "hiring_job_titles", operators: ["in", "contains"], valueType: "multi_select" },
    { fieldKey: "person_seniorities", operators: ["in"], valueType: "multi_select" },
    { fieldKey: "person_titles", operators: ["in"], valueType: "multi_select" },
    { fieldKey: "latest_funding_stage", operators: ["in", "eq"], valueType: "enum" },
  ];

  it("generates guided criteria from metadata.uiState + appends advanced rows", () => {
    const r = validateIcpInput(
      {
        name: "Romand core",
        status: "active",
        metadata: { uiState: { industries: ["Banking"], geographies: ["Vaud"] } },
        criteria: [{ fieldKey: "latest_funding_stage", operator: "in", value: ["seed"] }],
      },
      CATALOG,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const keys = r.value.criteria.map((c) => c.fieldKey).sort();
      expect(keys).toEqual(["geography", "industry", "latest_funding_stage"]);
      expect(r.value.uiState?.industries).toEqual(["Banking"]);
    }
  });

  it("an ACTIVE profile whose only criteria are guided passes the Phase-0 guard", () => {
    const r = validateIcpInput(
      { name: "X", status: "active", metadata: { uiState: { industries: ["Banking"] } } },
      CATALOG,
    );
    expect(r.ok).toBe(true);
  });

  it("an ACTIVE profile with an empty uiState and no advanced rows is still rejected", () => {
    const r = validateIcpInput(
      { name: "X", status: "active", metadata: { uiState: {} } },
      CATALOG,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid uiState shape with its specific error", () => {
    const r = validateIcpInput(
      { name: "X", metadata: { uiState: { industries: "Banking" } } },
      CATALOG,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/industries must be a string array/);
  });

  it("EMPTY_SOURCING_FILTERS shape matches parseSourcingFilters output", () => {
    const r = parseSourcingFilters({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(EMPTY_SOURCING_FILTERS);
  });
});
