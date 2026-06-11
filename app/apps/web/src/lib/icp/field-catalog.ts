/**
 * ICP field catalog — the criteria vocabulary (P1.2, _specs/multi-icp).
 *
 * The STANDARD catalog mirrors the Apollo search database 1:1 so that
 * a criterion on a standard field translates directly into an Apollo
 * search param (TAM build is a straight mapping, no fragile glue).
 * Verified against lib/integrations/apollo-client.ts:156-230.
 *
 * Each standard field declares:
 *   - source: where the value comes from / whether it's pushable to
 *       Apollo search ('apollo_search') or only available on the
 *       enriched result for scoring ('apollo_enrich')
 *   - valueType: drives the rule-builder input widget
 *   - operators: which predicates are legal
 *   - apolloParam: the literal Apollo request key (apollo_search only)
 *   - companyField: the key on the scored company context the
 *       evaluator reads (so scoring works on enriched companies even
 *       when the field was also a search filter)
 *
 * Tenant custom fields (custom_property / signal) are stored in the
 * `icp_field_catalog` table with tenant_id set; this module is the
 * GLOBAL seed + the typed contract.
 */

export type FieldSource =
  | "apollo_search"
  | "apollo_enrich"
  | "custom_property"
  | "signal";

export type FieldValueType =
  | "enum"
  | "multi_select"
  | "range"
  | "number"
  | "boolean"
  | "text"
  | "date_range";

export type CriterionOperator =
  | "eq"
  | "in"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "contains"
  | "exists"
  | "between";

export type FieldDefinition = {
  fieldKey: string;
  label: string;
  source: FieldSource;
  valueType: FieldValueType;
  operators: CriterionOperator[];
  /** Apollo request param when source=apollo_search. */
  apolloParam?: string;
  /** Key on the scored company context the evaluator reads. */
  companyField?: string;
};

// ── Standard catalog — mirrors Apollo search + enriched fields ──────
//
// apollo_search rows are pushable to searchOrganizations(); their
// apolloParam is the exact OrgSearchParams key. apollo_enrich rows are
// only on the returned OrgSearchOrganization, used for scoring.
export const STANDARD_FIELDS: FieldDefinition[] = [
  // ── Firmographics (search + enrich) ──
  {
    fieldKey: "industry",
    label: "Industry",
    source: "apollo_search",
    valueType: "multi_select",
    operators: ["in", "eq"],
    apolloParam: "q_organization_keyword_tags",
    companyField: "industry",
  },
  {
    fieldKey: "employee_count",
    label: "Employee count",
    source: "apollo_search",
    valueType: "range",
    operators: ["between", "gte", "lte"],
    apolloParam: "organization_num_employees_ranges",
    companyField: "estimatedNumEmployees",
  },
  {
    fieldKey: "geography",
    label: "HQ location",
    source: "apollo_search",
    valueType: "multi_select",
    operators: ["in"],
    apolloParam: "organization_locations",
    companyField: "country",
  },
  {
    fieldKey: "geography_exclude",
    label: "Exclude HQ location",
    source: "apollo_search",
    valueType: "multi_select",
    operators: ["in"],
    apolloParam: "organization_not_locations",
    companyField: "country",
  },
  {
    fieldKey: "revenue",
    label: "Annual revenue (USD)",
    source: "apollo_search",
    valueType: "range",
    operators: ["between", "gte", "lte"],
    apolloParam: "revenue_range",
    companyField: "annualRevenue",
  },
  {
    fieldKey: "technologies",
    label: "Technologies used",
    source: "apollo_search",
    valueType: "multi_select",
    operators: ["in", "contains"],
    apolloParam: "currently_using_any_of_technology_uids",
    companyField: "technologyNames",
  },
  {
    fieldKey: "keywords",
    label: "Company keywords",
    source: "apollo_search",
    valueType: "multi_select",
    operators: ["in", "contains"],
    apolloParam: "q_organization_keyword_tags",
    companyField: "keywords",
  },
  // ── Funding signals (search + enrich) ──
  {
    fieldKey: "latest_funding_date",
    label: "Latest funding date",
    source: "apollo_search",
    valueType: "date_range",
    operators: ["between", "gte"],
    apolloParam: "latest_funding_date_range",
    companyField: "latestFundingRaisedAt",
  },
  {
    fieldKey: "total_funding",
    label: "Total funding (USD)",
    source: "apollo_search",
    valueType: "range",
    operators: ["between", "gte", "lte"],
    apolloParam: "total_funding_range",
    companyField: "totalFunding",
  },
  {
    fieldKey: "latest_funding_stage",
    label: "Latest funding stage",
    source: "apollo_enrich",
    valueType: "enum",
    operators: ["in", "eq"],
    companyField: "latestFundingStage",
  },
  // ── Hiring signals (search + enrich) ──
  {
    fieldKey: "num_open_jobs",
    label: "Active job postings",
    source: "apollo_search",
    valueType: "range",
    operators: ["between", "gte"],
    apolloParam: "organization_num_jobs_range",
    companyField: "numCurrentJobOpenings",
  },
  {
    fieldKey: "hiring_job_titles",
    label: "Hiring for titles",
    source: "apollo_search",
    valueType: "multi_select",
    operators: ["in", "contains"],
    apolloParam: "q_organization_job_titles",
  },
  // ── Enrich-only scorable fields ──
  {
    fieldKey: "founded_year",
    label: "Founded year",
    source: "apollo_enrich",
    valueType: "number",
    operators: ["gte", "lte", "between"],
    companyField: "foundedYear",
  },
  {
    fieldKey: "investor_names",
    label: "Investors",
    source: "apollo_enrich",
    valueType: "multi_select",
    operators: ["in", "contains", "exists"],
    companyField: "investorNames",
  },
  // ── People dimension (search) ──
  {
    fieldKey: "person_titles",
    label: "Target person titles",
    source: "apollo_search",
    valueType: "multi_select",
    operators: ["in"],
    apolloParam: "person_titles",
  },
  {
    fieldKey: "person_seniorities",
    label: "Target seniorities",
    source: "apollo_search",
    valueType: "multi_select",
    operators: ["in"],
    apolloParam: "person_seniorities",
  },
];

/**
 * Fields that can never be evaluated against a COMPANY context (people
 * targeting + job-title search params — buildCompanyContext never
 * produces these keys). The blended fit engine skips them so they
 * neither dilute the score nor drag coverage down; they stay pure
 * sourcing / people-search filters, and the editor labels them so
 * (_specs/icp-unification R2.6 / R4.5).
 */
export const SOURCING_ONLY_FIELD_KEYS: ReadonlySet<string> = new Set([
  "person_titles",
  "person_seniorities",
  "hiring_job_titles",
]);

/** Lookup a standard field by key. */
export function getStandardField(
  fieldKey: string,
): FieldDefinition | undefined {
  return STANDARD_FIELDS.find((f) => f.fieldKey === fieldKey);
}

/** Field keys pushable to Apollo organization search. */
export function apolloSearchFieldKeys(): string[] {
  return STANDARD_FIELDS.filter((f) => f.source === "apollo_search").map(
    (f) => f.fieldKey,
  );
}

/**
 * Seed rows for the global (tenant_id NULL) catalog — consumed by the
 * 0056 migration follow-up seed + the retro-compat script. Shape
 * matches the icp_field_catalog columns.
 */
export function standardCatalogSeedRows(): Array<{
  fieldKey: string;
  label: string;
  source: FieldSource;
  valueType: FieldValueType;
  operators: CriterionOperator[];
  apolloParam: string | null;
}> {
  return STANDARD_FIELDS.map((f) => ({
    fieldKey: f.fieldKey,
    label: f.label,
    source: f.source,
    valueType: f.valueType,
    operators: f.operators,
    apolloParam: f.apolloParam ?? null,
  }));
}
