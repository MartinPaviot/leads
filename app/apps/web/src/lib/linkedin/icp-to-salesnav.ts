/**
 * Spec 36 (T11, #2) — translate an Elevay ICP's criteria into a PRECISE
 * Sales-Navigator search body. LinkedIn filters are numeric IDs, not labels, so
 * free-text industries/locations/titles/companies/schools/functions are resolved
 * via GET /linkedin/search/parameters (top match, cached per run). The rest are
 * structured filters with fixed vocabularies (seniority, company size, tenure,
 * spotlights, saved lists) that pass through validated — no resolution.
 *
 * The precision win over v1: on Sales Navigator, titles go into the dedicated
 * `role` filter (current-title match) instead of `keywords` (whole-profile fuzzy
 * match) — verified tighter live (224k vs 251k for "VP of Sales"). The full SN
 * filter vocabulary + exact shapes are documented in
 * `_reports/salesnav-filter-vocabulary-2026-06-30.md`.
 *
 * buildSalesNavBody + the validators are pure + unit-tested; resolveIcpToSalesNav
 * Query is the thin async orchestration over the resolver.
 */

import {
  resolveLinkedInParameter,
  searchLinkedIn,
  type UnipileConfig,
  type LinkedInParameterType,
  type LinkedInParameterService,
  type LinkedInSearchApi,
  type LinkedInSearchCategory,
} from "@/lib/providers/unipile/http";

// ---------------------------------------------------------------------------
// Structural value vocabularies — the exact enums the live SN schema accepts.
// ---------------------------------------------------------------------------

/** SN seniority levels (the exact enum the `seniority` filter accepts). */
export const SENIORITY_LEVELS = [
  "owner/partner",
  "cxo",
  "vice_president",
  "director",
  "experienced_manager",
  "entry_level_manager",
  "strategic",
  "senior",
  "entry_level",
  "in_training",
] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

/** SN company-type enum. */
export const COMPANY_TYPES = [
  "public_company",
  "privately_held",
  "non_profit",
  "educational_institution",
  "partnership",
  "self_employed",
  "self_owned",
  "government_agency",
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

/** SN company recent-activity enum (buying signals; companies category). */
export const RECENT_ACTIVITIES = ["senior_leadership_changes", "funding_events"] as const;
export type RecentActivity = (typeof RECENT_ACTIVITIES)[number];

/** A min/max bucket range. The SN edges are fixed enums — out-of-range values
 * are snapped to the nearest allowed edge. */
export interface BucketRange {
  min?: number;
  max?: number;
}
/** Headcount bucket edges (company_headcount / companies.headcount). */
export const HEADCOUNT_MIN = [1, 11, 51, 201, 501, 1001, 5001, 10001] as const;
export const HEADCOUNT_MAX = [1, 10, 50, 200, 500, 1000, 5000, 10000] as const;
/** Tenure bucket edges, in years (tenure / tenure_at_company / tenure_at_role). */
export const TENURE_MIN = [0, 1, 3, 6, 10] as const;
export const TENURE_MAX = [1, 2, 5, 10] as const;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The ICP criteria we map onto a Sales-Nav search. Free-text fields (top group)
 * resolve to LinkedIn ids; structured fields (bottom groups) validate against the
 * fixed vocabularies above. */
export interface IcpSearchCriteria {
  // Free-text → resolved to LinkedIn filter ids
  industries?: string[];
  locations?: string[];
  jobTitles?: string[];
  companies?: string[];
  pastCompanies?: string[];
  schools?: string[];
  functions?: string[];
  // Structured (people)
  seniorities?: string[];
  companyTypes?: string[];
  companyHeadcount?: BucketRange[];
  tenure?: BucketRange[];
  profileLanguages?: string[];
  // Spotlights — intent booleans (people)
  changedJobs?: boolean;
  postedOnLinkedin?: boolean;
  mentionedInNews?: boolean;
  // Structured (companies)
  hasJobOffers?: boolean;
  recentActivities?: string[];
  // Scope to the seat's own saved collections
  leadListIds?: string[];
  accountListIds?: string[];
  savedSearchId?: string;
  // Passthrough
  keywords?: string;
  networkDistance?: number[];
}

/** The free-text criteria we resolve to ids. */
export type ResolvableType =
  | "INDUSTRY"
  | "LOCATION"
  | "JOB_TITLE"
  | "COMPANY"
  | "PAST_COMPANY"
  | "SCHOOL"
  | "FUNCTION";

export interface ResolvedFilter {
  type: ResolvableType;
  /** The label the user typed. */
  label: string;
  /** The resolved LinkedIn numeric ID, or null when nothing matched. */
  id: string | null;
  /** The LinkedIn title we matched the label to (for the confirmation report). */
  matched: string | null;
}

// A `type` (not an interface) on purpose: type aliases get an implicit index
// signature, so this is assignable to the `{ …; [k: string]: unknown }` query
// param of searchLinkedIn/sourceFromSalesNav (an interface is not — TS2322).
export type SalesNavSearchBody = {
  api: LinkedInSearchApi;
  category: LinkedInSearchCategory;
  keywords?: string;
  /** Sales Navigator / Recruiter use { include }; Classic uses a flat id array. */
  location?: string[] | { include: string[] };
  industry?: string[] | { include: string[] };
  /** Classic people only — its title filter is a flat id array. */
  job_title?: string[];
  /** SN people: current-title filter (id OR plain text). The precise alternative
   * to folding titles into keywords. */
  role?: { include: string[] };
  company?: { include: string[] };
  past_company?: { include: string[] };
  function?: { include: string[] };
  school?: { include: string[] };
  seniority?: { include: SeniorityLevel[] };
  company_type?: CompanyType[];
  /** People: company size of the contact's employer. */
  company_headcount?: BucketRange[];
  /** Companies category: company size. */
  headcount?: BucketRange[];
  tenure?: BucketRange[];
  profile_language?: string[];
  network_distance?: number[];
  // Spotlights (people)
  changed_jobs?: boolean;
  posted_on_linkedin?: boolean;
  /** SN spells this with two n's — keep it verbatim. */
  mentionned_in_news?: boolean;
  // Companies
  has_job_offers?: boolean;
  recent_activities?: RecentActivity[];
  // Saved collections
  lead_lists?: { include: string[] };
  account_lists?: { include: string[] };
  /** Re-runs a saved Sales-Nav search — OVERRIDES every other filter. */
  saved_search_id?: string;
};

/** Validated structured filters — already checked against the fixed vocabularies. */
export interface StructuredFilters {
  seniorities?: SeniorityLevel[];
  companyTypes?: CompanyType[];
  companyHeadcount?: BucketRange[];
  tenure?: BucketRange[];
  profileLanguages?: string[];
  changedJobs?: boolean;
  postedOnLinkedin?: boolean;
  mentionedInNews?: boolean;
  hasJobOffers?: boolean;
  recentActivities?: RecentActivity[];
  leadListIds?: string[];
  accountListIds?: string[];
  savedSearchId?: string;
}

// ---------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------

const snapToEdge = (value: number, edges: readonly number[]): number =>
  edges.reduce((best, e) => (Math.abs(e - value) < Math.abs(best - value) ? e : best), edges[0]);

function validateRange(r: BucketRange, mins: readonly number[], maxes: readonly number[]): BucketRange | null {
  const out: BucketRange = {};
  if (typeof r.min === "number" && Number.isFinite(r.min)) out.min = snapToEdge(r.min, mins);
  if (typeof r.max === "number" && Number.isFinite(r.max)) out.max = snapToEdge(r.max, maxes);
  return out.min === undefined && out.max === undefined ? null : out;
}

/** Validate the structured ICP inputs against the fixed SN vocabularies. Drops
 * (and reports) anything not in the enum; snaps range edges to the nearest
 * allowed bucket. Pure. */
export function validateStructured(icp: IcpSearchCriteria): { structured: StructuredFilters; dropped: string[] } {
  const dropped: string[] = [];
  const s: StructuredFilters = {};

  const keepEnum = <T extends string>(vals: string[] | undefined, allowed: readonly T[], field: string): T[] => {
    const set = new Set<string>(allowed);
    const out: T[] = [];
    for (const v of vals ?? []) {
      const norm = v.trim().toLowerCase();
      if (set.has(norm)) out.push(norm as T);
      else if (v.trim()) dropped.push(`${field} "${v.trim()}" ignored (not a LinkedIn ${field} value)`);
    }
    return out;
  };

  const sen = keepEnum(icp.seniorities, SENIORITY_LEVELS, "seniority");
  if (sen.length) s.seniorities = sen;
  const ct = keepEnum(icp.companyTypes, COMPANY_TYPES, "company type");
  if (ct.length) s.companyTypes = ct;
  const ra = keepEnum(icp.recentActivities, RECENT_ACTIVITIES, "recent activity");
  if (ra.length) s.recentActivities = ra;

  const hc = (icp.companyHeadcount ?? [])
    .map((r) => validateRange(r, HEADCOUNT_MIN, HEADCOUNT_MAX))
    .filter((r): r is BucketRange => r !== null);
  if (hc.length) s.companyHeadcount = hc;
  const ten = (icp.tenure ?? [])
    .map((r) => validateRange(r, TENURE_MIN, TENURE_MAX))
    .filter((r): r is BucketRange => r !== null);
  if (ten.length) s.tenure = ten;

  const langs = (icp.profileLanguages ?? [])
    .map((l) => l.trim().toLowerCase())
    .filter((l) => {
      if (/^[a-z]{2}$/.test(l)) return true;
      if (l) dropped.push(`language "${l}" ignored (need a 2-letter ISO-639-1 code)`);
      return false;
    });
  if (langs.length) s.profileLanguages = langs;

  const ids = (vals: string[] | undefined): string[] => (vals ?? []).map((v) => v.trim()).filter(Boolean);
  const ll = ids(icp.leadListIds);
  if (ll.length) s.leadListIds = ll;
  const al = ids(icp.accountListIds);
  if (al.length) s.accountListIds = al;
  if (icp.savedSearchId?.trim()) s.savedSearchId = icp.savedSearchId.trim();

  if (icp.changedJobs) s.changedJobs = true;
  if (icp.postedOnLinkedin) s.postedOnLinkedin = true;
  if (icp.mentionedInNews) s.mentionedInNews = true;
  if (icp.hasJobOffers) s.hasJobOffers = true;

  return { structured: s, dropped };
}

// ---------------------------------------------------------------------------
// Body assembly (pure)
// ---------------------------------------------------------------------------

/** The `/search/parameters` type to resolve a free-text filter with, given the
 * search tier. SN uses SALES_INDUSTRY/REGION (≡ INDUSTRY/LOCATION ids there);
 * FUNCTION resolves via DEPARTMENT. Pure. */
export function paramTypeFor(
  type: ResolvableType,
  api: LinkedInSearchApi,
  category: LinkedInSearchCategory,
): LinkedInParameterType {
  const sn = api === "sales_navigator" || api === "recruiter";
  switch (type) {
    case "INDUSTRY":
      return sn ? "SALES_INDUSTRY" : "INDUSTRY";
    case "LOCATION":
      return sn && category === "people" ? "REGION" : "LOCATION";
    case "JOB_TITLE":
      return "JOB_TITLE";
    case "COMPANY":
    case "PAST_COMPANY":
      return "COMPANY";
    case "SCHOOL":
      return "SCHOOL";
    case "FUNCTION":
      return "DEPARTMENT";
  }
}

/**
 * Assemble the POST /linkedin/search body from resolved filters + validated
 * structured filters. Pure. Shape is tier/category-specific and matches the LIVE
 * Unipile schema (verified). For sales_navigator/recruiter people: location/
 * industry/school/function are `{ include: [numericIds] }`; role/company accept
 * id OR plain text; titles use the `role` filter (NOT keywords). For classic:
 * flat id arrays + a job_title array. A `savedSearchId` overrides everything.
 */
export function buildSalesNavBody(
  api: LinkedInSearchApi,
  category: LinkedInSearchCategory,
  resolved: ResolvedFilter[],
  opts: { keywords?: string; networkDistance?: number[]; structured?: StructuredFilters } = {},
): SalesNavSearchBody {
  const body: SalesNavSearchBody = { api, category };
  const s = opts.structured ?? {};

  // A saved search re-run ignores all other filters by design — send it alone.
  if (s.savedSearchId) {
    body.saved_search_id = s.savedSearchId;
    if (opts.networkDistance?.length) body.network_distance = opts.networkDistance;
    return body;
  }

  // Numeric-id-only fields (drop unresolved — plain text would 400).
  const idsOf = (t: ResolvableType): string[] =>
    resolved.filter((r) => r.type === t && r.id != null).map((r) => String(r.id));
  // id-or-text fields (role/company accept plain text; fall back to the label).
  const idOrLabelOf = (t: ResolvableType): string[] =>
    resolved.filter((r) => r.type === t).map((r) => String(r.id ?? r.label)).filter(Boolean);

  const location = idsOf("LOCATION");
  const industry = idsOf("INDUSTRY");
  const advanced = api === "sales_navigator" || api === "recruiter";

  if (location.length) body.location = advanced ? { include: location } : location;
  if (industry.length) body.industry = advanced ? { include: industry } : industry;

  if (advanced) {
    if (category === "people") {
      const role = idOrLabelOf("JOB_TITLE");
      if (role.length) body.role = { include: role };
      const company = idOrLabelOf("COMPANY");
      if (company.length) body.company = { include: company };
      const past = idOrLabelOf("PAST_COMPANY");
      if (past.length) body.past_company = { include: past };
      const school = idsOf("SCHOOL");
      if (school.length) body.school = { include: school };
      const fn = idsOf("FUNCTION");
      if (fn.length) body.function = { include: fn };

      if (s.seniorities?.length) body.seniority = { include: s.seniorities };
      if (s.companyTypes?.length) body.company_type = s.companyTypes;
      if (s.companyHeadcount?.length) body.company_headcount = s.companyHeadcount;
      if (s.tenure?.length) body.tenure = s.tenure;
      if (s.profileLanguages?.length) body.profile_language = s.profileLanguages;
      if (s.changedJobs) body.changed_jobs = true;
      if (s.postedOnLinkedin) body.posted_on_linkedin = true;
      if (s.mentionedInNews) body.mentionned_in_news = true;
      if (s.leadListIds?.length) body.lead_lists = { include: s.leadListIds };
      if (s.accountListIds?.length) body.account_lists = { include: s.accountListIds };
    } else {
      // companies category
      if (s.companyHeadcount?.length) body.headcount = s.companyHeadcount;
      if (s.hasJobOffers) body.has_job_offers = true;
      if (s.recentActivities?.length) body.recent_activities = s.recentActivities;
      if (s.accountListIds?.length) body.account_lists = { include: s.accountListIds };
    }
  } else if (category === "people") {
    // Classic people: a flat job_title id array (no `role`/structured filters).
    const jobTitle = idsOf("JOB_TITLE");
    if (jobTitle.length) body.job_title = jobTitle;
  }

  const keywords = opts.keywords?.trim();
  if (keywords) body.keywords = keywords;
  if (opts.networkDistance?.length) body.network_distance = opts.networkDistance;
  return body;
}

/** The LinkedIn parameter service that matches a search api tier. Pure. */
export function serviceForApi(api: LinkedInSearchApi): LinkedInParameterService {
  return api === "sales_navigator" ? "SALES_NAVIGATOR" : api === "recruiter" ? "RECRUITER" : "CLASSIC";
}

/** True when the assembled body carries at least one real targeting filter
 * (anything beyond api/category/network_distance). Pure. */
export function bodyIsUsable(body: SalesNavSearchBody): boolean {
  return Object.keys(body).some((k) => k !== "api" && k !== "category" && k !== "network_distance");
}

// ---------------------------------------------------------------------------
// Async orchestration
// ---------------------------------------------------------------------------

export interface IcpResolveResult {
  body: SalesNavSearchBody;
  /** Resolvable free-text filters → id matches/misses (for the confirmation report). */
  report: ResolvedFilter[];
  /** Human-readable notes for structured values that were dropped/snapped. */
  dropped: string[];
  /** true when the search is meaningful — see bodyIsUsable. */
  usable: boolean;
}

/**
 * Resolve an ICP's free-text filters to LinkedIn ids (top match each, cached per
 * run, in the search's own service), validate the structured filters, and build
 * the Sales-Nav search body. Returns the body + a resolution report + dropped
 * notes so the caller can show "France → France (105015875)" and flag misses.
 */
export async function resolveIcpToSalesNavQuery(
  cfg: UnipileConfig,
  accountId: string,
  icp: IcpSearchCriteria,
  opts: { api: LinkedInSearchApi; category: LinkedInSearchCategory },
): Promise<IcpResolveResult> {
  const cache = new Map<string, { id: string; title: string } | null>();

  const resolveOne = async (type: ResolvableType, raw: string): Promise<ResolvedFilter> => {
    const label = raw.trim();
    const key = `${type}:${label.toLowerCase()}`;
    if (!cache.has(key)) {
      const paramType = paramTypeFor(type, opts.api, opts.category);
      const items = await resolveLinkedInParameter(cfg, accountId, paramType, label, serviceForApi(opts.api), 1);
      cache.set(key, items[0] ?? null);
    }
    const hit = cache.get(key) ?? null;
    return { type, label, id: hit?.id ?? null, matched: hit?.title ?? null };
  };

  const report: ResolvedFilter[] = [];
  const resolveAll = async (type: ResolvableType, labels: string[] | undefined) => {
    for (const l of labels ?? []) if (l.trim()) report.push(await resolveOne(type, l));
  };
  await resolveAll("INDUSTRY", icp.industries);
  await resolveAll("LOCATION", icp.locations);
  await resolveAll("JOB_TITLE", icp.jobTitles);
  await resolveAll("COMPANY", icp.companies);
  await resolveAll("PAST_COMPANY", icp.pastCompanies);
  await resolveAll("SCHOOL", icp.schools);
  await resolveAll("FUNCTION", icp.functions);

  const { structured, dropped } = validateStructured(icp);

  const body = buildSalesNavBody(opts.api, opts.category, report, {
    keywords: icp.keywords,
    networkDistance: icp.networkDistance,
    structured,
  });
  return { body, report, dropped, usable: bodyIsUsable(body) };
}

/**
 * Pre-flight TAM preview — run the assembled search with limit=1 and return
 * paging.total_count (the size of the segment this query targets) WITHOUT
 * sourcing. Lets the founder see "≈12 480 prospects" before committing the run.
 * Returns null when LinkedIn doesn't report a total.
 */
export async function previewSalesNavCount(
  cfg: UnipileConfig,
  accountId: string,
  body: SalesNavSearchBody,
): Promise<number | null> {
  const page = await searchLinkedIn(cfg, accountId, body, { limit: 1 });
  return page.total;
}
