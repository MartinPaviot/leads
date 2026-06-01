/**
 * Flatten a company row into the CompanyContext the criteria engine
 * reads (P1b, _specs/multi-icp). Pure.
 *
 * The engine keys criteria by catalog `companyField` (e.g. "industry",
 * "estimatedNumEmployees"). But the actual data lives in two places on
 * a company:
 *   - direct columns: companies.industry, companies.size, companies.revenue
 *   - the Apollo enrichment dump under companies.properties (jsonb),
 *     written by the enrichment pipeline with Apollo's snake_case keys
 *     (estimated_num_employees, annual_revenue, technology_names,
 *     latest_funding_stage, latest_funding_raised_at, founded_year,
 *     investor_names, num_current_job_openings, country, ...).
 *
 * This builder normalises both into one flat bag keyed by the catalog
 * fieldKey, so a criterion `{ fieldKey: "employee_count" }` resolves
 * whether the count came from the column or the properties dump.
 *
 * Custom-property and signal criteria are layered on top by the caller
 * (the recompute job) via `extra` — those keys pass through verbatim.
 */

export type CompanyRow = {
  industry?: string | null;
  size?: string | null;
  revenue?: string | null;
  properties?: Record<string, unknown> | null;
};

export type CompanyContext = Record<string, unknown>;

function prop(props: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!props) return undefined;
  return props[key];
}

/** Parse a size label or number to an employee count (use the low bound
 *  of a "51-200" style label so a `gte 50` criterion fires). */
function toEmployeeCount(
  size: string | null | undefined,
  props: Record<string, unknown> | null | undefined,
): number | undefined {
  const fromProps = prop(props, "estimated_num_employees");
  if (typeof fromProps === "number") return fromProps;
  if (typeof fromProps === "string" && fromProps && !Number.isNaN(Number(fromProps))) {
    return Number(fromProps);
  }
  if (!size) return undefined;
  const clean = String(size).replace(/,/g, "").trim();
  if (clean.endsWith("+")) return Number(clean.slice(0, -1)) || undefined;
  const lo = clean.split("-")[0];
  const n = Number(lo);
  return Number.isFinite(n) ? n : undefined;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

/**
 * Build the flat CompanyContext keyed by catalog fieldKey. Only sets a
 * key when the underlying value is present, so `exists` criteria and
 * the "absent field" path in the engine behave correctly.
 */
export function buildCompanyContext(
  company: CompanyRow,
  extra: Record<string, unknown> = {},
): CompanyContext {
  const props = company.properties ?? {};
  const ctx: CompanyContext = {};

  // industry: column first, then properties
  const industry = company.industry ?? prop(props, "industry");
  if (industry != null && industry !== "") ctx.industry = industry;

  // employee_count
  const emp = toEmployeeCount(company.size, props);
  if (emp != null) ctx.employee_count = emp;

  // geography: properties.country (Apollo) preferred
  const country = prop(props, "country") ?? prop(props, "geography");
  if (country != null && country !== "") ctx.geography = country;

  // revenue: column (string) or properties.annual_revenue
  const revenue = toNumber(company.revenue) ?? toNumber(prop(props, "annual_revenue"));
  if (revenue != null) ctx.revenue = revenue;

  // technologies
  const tech = prop(props, "technology_names") ?? prop(props, "technologies");
  if (Array.isArray(tech) && tech.length > 0) ctx.technologies = tech;

  // keywords
  const keywords = prop(props, "keywords");
  if (Array.isArray(keywords) && keywords.length > 0) ctx.keywords = keywords;

  // funding
  const fundingStage = prop(props, "latest_funding_stage");
  if (fundingStage != null && fundingStage !== "") ctx.latest_funding_stage = fundingStage;
  const fundingDate = prop(props, "latest_funding_raised_at");
  if (fundingDate != null && fundingDate !== "") {
    // store as epoch ms so the engine's numeric between works on dates
    const t = new Date(String(fundingDate)).getTime();
    if (Number.isFinite(t)) ctx.latest_funding_date = t;
  }
  const totalFunding = toNumber(prop(props, "total_funding"));
  if (totalFunding != null) ctx.total_funding = totalFunding;

  // hiring
  const jobs = toNumber(prop(props, "num_current_job_openings"));
  if (jobs != null) ctx.num_open_jobs = jobs;

  // founded year
  const founded = toNumber(prop(props, "founded_year"));
  if (founded != null) ctx.founded_year = founded;

  // investors
  const investors = prop(props, "investor_names");
  if (Array.isArray(investors) && investors.length > 0) ctx.investor_names = investors;

  // Layer custom-property + signal keys verbatim (override standard on
  // collision — the caller knows best for tenant-specific fields).
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) ctx[k] = v;
  }

  return ctx;
}
