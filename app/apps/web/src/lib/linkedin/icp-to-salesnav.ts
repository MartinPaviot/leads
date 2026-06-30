/**
 * Spec 36 (T11, #2) — translate an Elevay ICP's criteria into a PRECISE
 * Sales-Navigator search body. LinkedIn filters are numeric IDs, not labels, so
 * free-text industries/locations/titles/companies/schools/functions/past-roles/
 * company-HQ/connections-of/postal-codes are resolved via GET
 * /linkedin/search/parameters (top match, cached per run). The rest are
 * structured filters with fixed vocabularies (seniority, company size, tenure,
 * revenue, growth, spotlights, saved lists/personas/groups) that pass through
 * validated — no resolution.
 *
 * The precision win over v1: on Sales Navigator, titles go into the dedicated
 * `role` filter (current-title match) instead of `keywords` (whole-profile fuzzy
 * match) — verified tighter live. This module wires the FULL live SN filter
 * vocabulary (both People and Companies). Exact shapes are documented in
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
/** Annual-revenue bucket edges, in millions; max 1001 = "1000+" (companies). */
export const REVENUE_EDGES = [0, 0.2, 1, 2.5, 5, 10, 20, 50, 100, 500, 1000, 1001] as const;
/** Followers-count bucket edges (companies). */
export const FOLLOWERS_MIN = [1, 51, 101, 1001, 5001] as const;
export const FOLLOWERS_MAX = [50, 100, 1000, 5000] as const;
/** Fortune-rank bucket edges (companies). */
export const FORTUNE_MIN = [0, 51, 101, 251] as const;
export const FORTUNE_MAX = [50, 100, 250, 500] as const;

/** Annual-revenue range (companies). currency = ISO-4217; min/max in millions. */
export interface RevenueRange {
  currency?: string;
  min?: number;
  max?: number;
}
/** A department-scoped headcount/growth filter (companies). */
export interface DepartmentHeadcount {
  /** Free-text department names; resolved to DEPARTMENT ids. */
  departments?: string[];
  min?: number;
  max?: number;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The ICP criteria we map onto a Sales-Nav search. Free-text fields (top group)
 * resolve to LinkedIn ids; structured fields validate against the fixed
 * vocabularies above; passthrough-id fields (personaIds/groupIds/technologyIds/
 * listIds) are LinkedIn ids the caller already has (from the collections route). */
export interface IcpSearchCriteria {
  // Free-text → resolved to LinkedIn filter ids
  industries?: string[];
  locations?: string[];
  jobTitles?: string[];
  companies?: string[];
  pastCompanies?: string[];
  pastRoles?: string[];
  schools?: string[];
  functions?: string[];
  companyHqLocations?: string[];
  connectionsOf?: string[];
  postalCodes?: string[];
  // Structured (people)
  seniorities?: string[];
  companyTypes?: string[];
  companyHeadcount?: BucketRange[];
  tenure?: BucketRange[];
  tenureAtCompany?: BucketRange[];
  tenureAtRole?: BucketRange[];
  profileLanguages?: string[];
  firstName?: string;
  lastName?: string;
  withinAreaMiles?: number;
  // Spotlights — intent / warm booleans (people)
  changedJobs?: boolean;
  postedOnLinkedin?: boolean;
  mentionedInNews?: boolean;
  followingYourCompany?: boolean;
  viewedYourProfileRecently?: boolean;
  viewedProfileRecently?: boolean;
  messagedRecently?: boolean;
  pastColleague?: boolean;
  sharedExperiences?: boolean;
  // Structured (companies)
  hasJobOffers?: boolean;
  recentActivities?: string[];
  annualRevenue?: RevenueRange;
  headcountGrowth?: BucketRange;
  departmentHeadcount?: DepartmentHeadcount;
  departmentHeadcountGrowth?: DepartmentHeadcount;
  followersCount?: BucketRange[];
  fortune?: BucketRange[];
  // Passthrough LinkedIn ids (from the collections route / saved searches)
  leadListIds?: string[];
  accountListIds?: string[];
  personaIds?: string[];
  groupIds?: string[];
  technologyIds?: string[];
  savedAccountIds?: string[];
  includeSavedLeads?: boolean;
  includeSavedAccounts?: boolean;
  savedSearchId?: string;
  recentSearchId?: string;
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
  | "PAST_ROLE"
  | "SCHOOL"
  | "FUNCTION"
  | "COMPANY_LOCATION"
  | "CONNECTIONS_OF"
  | "POSTAL_CODE";

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
  first_name?: string;
  last_name?: string;
  /** Sales Navigator / Recruiter use { include }; Classic uses a flat id array. */
  location?: string[] | { include: string[] };
  location_by_postal_code?: { include: string[]; within_area?: number };
  industry?: string[] | { include: string[] };
  /** Classic people only — its title filter is a flat id array. */
  job_title?: string[];
  /** SN people: current-title filter (id OR plain text). The precise alternative
   * to folding titles into keywords. */
  role?: { include: string[] };
  past_role?: { include: string[] };
  company?: { include: string[] };
  past_company?: { include: string[] };
  company_location?: { include: string[] };
  function?: { include: string[] };
  school?: { include: string[] };
  seniority?: { include: SeniorityLevel[] };
  company_type?: CompanyType[];
  /** People: company size of the contact's employer. */
  company_headcount?: BucketRange[];
  /** Companies category: company size. */
  headcount?: BucketRange[];
  headcount_growth?: { min?: number; max?: number };
  department_headcount?: { department: string[]; min?: number; max?: number };
  department_headcount_growth?: { department: string[]; min?: number; max?: number };
  annual_revenue?: { currency: string; min: number; max: number };
  followers_count?: BucketRange[];
  fortune?: BucketRange[];
  technologies?: string[];
  tenure?: BucketRange[];
  tenure_at_company?: BucketRange[];
  tenure_at_role?: BucketRange[];
  profile_language?: string[];
  network_distance?: number[];
  connections_of?: string[];
  groups?: string[];
  persona?: string[];
  // Spotlights (people)
  changed_jobs?: boolean;
  posted_on_linkedin?: boolean;
  /** SN spells this with two n's — keep it verbatim. */
  mentionned_in_news?: boolean;
  following_your_company?: boolean;
  viewed_your_profile_recently?: boolean;
  viewed_profile_recently?: boolean;
  messaged_recently?: boolean;
  past_colleague?: boolean;
  shared_experiences?: boolean;
  // Companies
  has_job_offers?: boolean;
  recent_activities?: RecentActivity[];
  // Saved collections
  lead_lists?: { include: string[] };
  account_lists?: { include: string[] };
  saved_accounts?: string[];
  include_saved_leads?: boolean;
  include_saved_accounts?: boolean;
  /** Re-runs a saved / recent Sales-Nav search — OVERRIDES every other filter. */
  saved_search_id?: string;
  recent_search_id?: string;
};

/** Validated structured filters — already checked against the fixed vocabularies,
 * and (for department headcount) with department names already resolved to ids. */
export interface StructuredFilters {
  seniorities?: SeniorityLevel[];
  companyTypes?: CompanyType[];
  companyHeadcount?: BucketRange[];
  tenure?: BucketRange[];
  tenureAtCompany?: BucketRange[];
  tenureAtRole?: BucketRange[];
  profileLanguages?: string[];
  firstName?: string;
  lastName?: string;
  withinAreaMiles?: number;
  changedJobs?: boolean;
  postedOnLinkedin?: boolean;
  mentionedInNews?: boolean;
  followingYourCompany?: boolean;
  viewedYourProfileRecently?: boolean;
  viewedProfileRecently?: boolean;
  messagedRecently?: boolean;
  pastColleague?: boolean;
  sharedExperiences?: boolean;
  hasJobOffers?: boolean;
  recentActivities?: RecentActivity[];
  annualRevenue?: { currency: string; min: number; max: number };
  headcountGrowth?: { min?: number; max?: number };
  /** department ids already resolved (by the async layer). */
  departmentHeadcount?: { departmentIds: string[]; min?: number; max?: number };
  departmentHeadcountGrowth?: { departmentIds: string[]; min?: number; max?: number };
  followersCount?: BucketRange[];
  fortune?: BucketRange[];
  technologyIds?: string[];
  leadListIds?: string[];
  accountListIds?: string[];
  savedAccountIds?: string[];
  personaIds?: string[];
  groupIds?: string[];
  includeSavedLeads?: boolean;
  includeSavedAccounts?: boolean;
  savedSearchId?: string;
  recentSearchId?: string;
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

function validateRanges(rs: BucketRange[] | undefined, mins: readonly number[], maxes: readonly number[]): BucketRange[] | undefined {
  const out = (rs ?? []).map((r) => validateRange(r, mins, maxes)).filter((r): r is BucketRange => r !== null);
  return out.length ? out : undefined;
}

/** Validate the structured ICP inputs against the fixed SN vocabularies. Drops
 * (and reports) anything not in the enum; snaps range edges to the nearest
 * allowed bucket. Department-headcount resolution is async, done by the caller.
 * Pure. */
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

  s.companyHeadcount = validateRanges(icp.companyHeadcount, HEADCOUNT_MIN, HEADCOUNT_MAX);
  s.tenure = validateRanges(icp.tenure, TENURE_MIN, TENURE_MAX);
  s.tenureAtCompany = validateRanges(icp.tenureAtCompany, TENURE_MIN, TENURE_MAX);
  s.tenureAtRole = validateRanges(icp.tenureAtRole, TENURE_MIN, TENURE_MAX);
  s.followersCount = validateRanges(icp.followersCount, FOLLOWERS_MIN, FOLLOWERS_MAX);
  s.fortune = validateRanges(icp.fortune, FORTUNE_MIN, FORTUNE_MAX);

  // Annual revenue — currency + both edges required; min/max snap to the enum.
  if (icp.annualRevenue && (icp.annualRevenue.min !== undefined || icp.annualRevenue.max !== undefined)) {
    const cur = (icp.annualRevenue.currency || "USD").trim().toUpperCase().slice(0, 3);
    const min = snapToEdge(Number(icp.annualRevenue.min ?? 0), REVENUE_EDGES);
    const max = snapToEdge(Number(icp.annualRevenue.max ?? 1001), REVENUE_EDGES);
    if (/^[A-Z]{3}$/.test(cur)) s.annualRevenue = { currency: cur, min, max };
    else dropped.push(`annual revenue currency "${cur}" ignored (need a 3-letter ISO-4217 code)`);
  }
  // Headcount growth — free percent numbers.
  if (icp.headcountGrowth) {
    const g: { min?: number; max?: number } = {};
    if (Number.isFinite(Number(icp.headcountGrowth.min))) g.min = Number(icp.headcountGrowth.min);
    if (Number.isFinite(Number(icp.headcountGrowth.max))) g.max = Number(icp.headcountGrowth.max);
    if (g.min !== undefined || g.max !== undefined) s.headcountGrowth = g;
  }

  const langs = (icp.profileLanguages ?? [])
    .map((l) => l.trim().toLowerCase())
    .filter((l) => {
      if (/^[a-z]{2}$/.test(l)) return true;
      if (l) dropped.push(`language "${l}" ignored (need a 2-letter ISO-639-1 code)`);
      return false;
    });
  if (langs.length) s.profileLanguages = langs;

  const ids = (vals: string[] | undefined): string[] => (vals ?? []).map((v) => v.trim()).filter(Boolean);
  const assignIds = (key: keyof StructuredFilters, vals: string[] | undefined) => {
    const out = ids(vals);
    if (out.length) (s as Record<string, unknown>)[key] = out;
  };
  assignIds("leadListIds", icp.leadListIds);
  assignIds("accountListIds", icp.accountListIds);
  assignIds("savedAccountIds", icp.savedAccountIds);
  assignIds("personaIds", icp.personaIds);
  assignIds("groupIds", icp.groupIds);
  assignIds("technologyIds", icp.technologyIds);

  if (icp.firstName?.trim()) s.firstName = icp.firstName.trim();
  if (icp.lastName?.trim()) s.lastName = icp.lastName.trim();
  if (Number.isFinite(Number(icp.withinAreaMiles)) && Number(icp.withinAreaMiles) > 0) s.withinAreaMiles = Number(icp.withinAreaMiles);
  if (icp.savedSearchId?.trim()) s.savedSearchId = icp.savedSearchId.trim();
  if (icp.recentSearchId?.trim()) s.recentSearchId = icp.recentSearchId.trim();

  // Spotlight / inclusion booleans — the input key equals the structured key, so
  // copy each straight across when set to true.
  const boolKeys = [
    "changedJobs",
    "postedOnLinkedin",
    "mentionedInNews",
    "followingYourCompany",
    "viewedYourProfileRecently",
    "viewedProfileRecently",
    "messagedRecently",
    "pastColleague",
    "sharedExperiences",
    "hasJobOffers",
    "includeSavedLeads",
    "includeSavedAccounts",
  ] as const satisfies ReadonlyArray<keyof IcpSearchCriteria & keyof StructuredFilters>;
  for (const k of boolKeys) if (icp[k] === true) (s as Record<string, unknown>)[k] = true;

  return { structured: s, dropped };
}

// ---------------------------------------------------------------------------
// Body assembly (pure)
// ---------------------------------------------------------------------------

/** The `/search/parameters` type to resolve a free-text filter with, given the
 * search tier. SN uses SALES_INDUSTRY/REGION (≡ INDUSTRY/LOCATION ids there);
 * FUNCTION→DEPARTMENT, CONNECTIONS_OF→PEOPLE, POSTAL_CODE→POSTAL_CODE. Pure. */
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
    case "COMPANY_LOCATION":
      return "REGION";
    case "JOB_TITLE":
    case "PAST_ROLE":
      return "JOB_TITLE";
    case "COMPANY":
    case "PAST_COMPANY":
      return "COMPANY";
    case "SCHOOL":
      return "SCHOOL";
    case "FUNCTION":
      return "DEPARTMENT";
    case "CONNECTIONS_OF":
      return "PEOPLE";
    case "POSTAL_CODE":
      return "POSTAL_CODE";
  }
}

/**
 * Assemble the POST /linkedin/search body from resolved filters + validated
 * structured filters. Pure. Shape is tier/category-specific and matches the LIVE
 * Unipile schema (verified). A `savedSearchId`/`recentSearchId` overrides
 * everything.
 */
export function buildSalesNavBody(
  api: LinkedInSearchApi,
  category: LinkedInSearchCategory,
  resolved: ResolvedFilter[],
  opts: { keywords?: string; networkDistance?: number[]; structured?: StructuredFilters } = {},
): SalesNavSearchBody {
  const body: SalesNavSearchBody = { api, category };
  const s = opts.structured ?? {};

  // A saved/recent search re-run ignores all other filters by design.
  if (s.savedSearchId || s.recentSearchId) {
    if (s.savedSearchId) body.saved_search_id = s.savedSearchId;
    else if (s.recentSearchId) body.recent_search_id = s.recentSearchId;
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
      const pastRole = idsOf("PAST_ROLE");
      if (pastRole.length) body.past_role = { include: pastRole };
      const company = idOrLabelOf("COMPANY");
      if (company.length) body.company = { include: company };
      const past = idOrLabelOf("PAST_COMPANY");
      if (past.length) body.past_company = { include: past };
      const companyLoc = idsOf("COMPANY_LOCATION");
      if (companyLoc.length) body.company_location = { include: companyLoc };
      const school = idsOf("SCHOOL");
      if (school.length) body.school = { include: school };
      const fn = idsOf("FUNCTION");
      if (fn.length) body.function = { include: fn };
      const connOf = idsOf("CONNECTIONS_OF");
      if (connOf.length) body.connections_of = connOf;
      const postal = idsOf("POSTAL_CODE");
      if (postal.length) {
        body.location_by_postal_code = { include: postal };
        if (s.withinAreaMiles) body.location_by_postal_code.within_area = s.withinAreaMiles;
      }

      if (s.seniorities?.length) body.seniority = { include: s.seniorities };
      if (s.companyTypes?.length) body.company_type = s.companyTypes;
      if (s.companyHeadcount?.length) body.company_headcount = s.companyHeadcount;
      if (s.tenure?.length) body.tenure = s.tenure;
      if (s.tenureAtCompany?.length) body.tenure_at_company = s.tenureAtCompany;
      if (s.tenureAtRole?.length) body.tenure_at_role = s.tenureAtRole;
      if (s.profileLanguages?.length) body.profile_language = s.profileLanguages;
      if (s.firstName) body.first_name = s.firstName;
      if (s.lastName) body.last_name = s.lastName;
      if (s.personaIds?.length) body.persona = s.personaIds;
      if (s.groupIds?.length) body.groups = s.groupIds;
      if (s.changedJobs) body.changed_jobs = true;
      if (s.postedOnLinkedin) body.posted_on_linkedin = true;
      if (s.mentionedInNews) body.mentionned_in_news = true;
      if (s.followingYourCompany) body.following_your_company = true;
      if (s.viewedYourProfileRecently) body.viewed_your_profile_recently = true;
      if (s.viewedProfileRecently) body.viewed_profile_recently = true;
      if (s.messagedRecently) body.messaged_recently = true;
      if (s.pastColleague) body.past_colleague = true;
      if (s.sharedExperiences) body.shared_experiences = true;
      if (s.leadListIds?.length) body.lead_lists = { include: s.leadListIds };
      if (s.accountListIds?.length) body.account_lists = { include: s.accountListIds };
      if (s.includeSavedLeads) body.include_saved_leads = true;
      if (s.includeSavedAccounts) body.include_saved_accounts = true;
    } else {
      // companies category
      if (s.companyHeadcount?.length) body.headcount = s.companyHeadcount;
      if (s.headcountGrowth) body.headcount_growth = s.headcountGrowth;
      if (s.departmentHeadcount?.departmentIds.length) {
        body.department_headcount = { department: s.departmentHeadcount.departmentIds };
        if (s.departmentHeadcount.min !== undefined) body.department_headcount.min = s.departmentHeadcount.min;
        if (s.departmentHeadcount.max !== undefined) body.department_headcount.max = s.departmentHeadcount.max;
      }
      if (s.departmentHeadcountGrowth?.departmentIds.length) {
        body.department_headcount_growth = { department: s.departmentHeadcountGrowth.departmentIds };
        if (s.departmentHeadcountGrowth.min !== undefined) body.department_headcount_growth.min = s.departmentHeadcountGrowth.min;
        if (s.departmentHeadcountGrowth.max !== undefined) body.department_headcount_growth.max = s.departmentHeadcountGrowth.max;
      }
      if (s.annualRevenue) body.annual_revenue = s.annualRevenue;
      if (s.followersCount?.length) body.followers_count = s.followersCount;
      if (s.fortune?.length) body.fortune = s.fortune;
      if (s.technologyIds?.length) body.technologies = s.technologyIds;
      if (s.hasJobOffers) body.has_job_offers = true;
      if (s.recentActivities?.length) body.recent_activities = s.recentActivities;
      if (s.accountListIds?.length) body.account_lists = { include: s.accountListIds };
      if (s.savedAccountIds?.length) body.saved_accounts = s.savedAccountIds;
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
 * run, in the search's own service), validate the structured filters, resolve
 * department-headcount department names, and build the Sales-Nav search body.
 * Returns the body + a resolution report + dropped notes.
 */
export async function resolveIcpToSalesNavQuery(
  cfg: UnipileConfig,
  accountId: string,
  icp: IcpSearchCriteria,
  opts: { api: LinkedInSearchApi; category: LinkedInSearchCategory },
): Promise<IcpResolveResult> {
  const cache = new Map<string, { id: string; title: string } | null>();
  const service = serviceForApi(opts.api);

  const resolveRaw = async (paramType: LinkedInParameterType, raw: string): Promise<{ id: string; title: string } | null> => {
    const label = raw.trim();
    const key = `${paramType}:${label.toLowerCase()}`;
    if (!cache.has(key)) {
      const items = await resolveLinkedInParameter(cfg, accountId, paramType, label, service, 1);
      cache.set(key, items[0] ?? null);
    }
    return cache.get(key) ?? null;
  };

  const report: ResolvedFilter[] = [];
  const resolveAll = async (type: ResolvableType, labels: string[] | undefined) => {
    for (const l of labels ?? []) {
      if (!l.trim()) continue;
      const hit = await resolveRaw(paramTypeFor(type, opts.api, opts.category), l);
      report.push({ type, label: l.trim(), id: hit?.id ?? null, matched: hit?.title ?? null });
    }
  };
  await resolveAll("INDUSTRY", icp.industries);
  await resolveAll("LOCATION", icp.locations);
  await resolveAll("JOB_TITLE", icp.jobTitles);
  await resolveAll("PAST_ROLE", icp.pastRoles);
  await resolveAll("COMPANY", icp.companies);
  await resolveAll("PAST_COMPANY", icp.pastCompanies);
  await resolveAll("COMPANY_LOCATION", icp.companyHqLocations);
  await resolveAll("SCHOOL", icp.schools);
  await resolveAll("FUNCTION", icp.functions);
  await resolveAll("CONNECTIONS_OF", icp.connectionsOf);
  await resolveAll("POSTAL_CODE", icp.postalCodes);

  const { structured, dropped } = validateStructured(icp);

  // Department-headcount needs DEPARTMENT ids — resolve names (companies only).
  const resolveDepartments = async (names: string[] | undefined): Promise<string[]> => {
    const out: string[] = [];
    for (const n of names ?? []) {
      if (!n.trim()) continue;
      const hit = await resolveRaw("DEPARTMENT", n);
      if (hit) out.push(hit.id);
      else dropped.push(`department "${n.trim()}" ignored (no LinkedIn match)`);
    }
    return out;
  };
  if (icp.departmentHeadcount?.departments?.length) {
    const departmentIds = await resolveDepartments(icp.departmentHeadcount.departments);
    if (departmentIds.length) {
      structured.departmentHeadcount = {
        departmentIds,
        min: Number.isFinite(Number(icp.departmentHeadcount.min)) ? Number(icp.departmentHeadcount.min) : undefined,
        max: Number.isFinite(Number(icp.departmentHeadcount.max)) ? Number(icp.departmentHeadcount.max) : undefined,
      };
    }
  }
  if (icp.departmentHeadcountGrowth?.departments?.length) {
    const departmentIds = await resolveDepartments(icp.departmentHeadcountGrowth.departments);
    if (departmentIds.length) {
      structured.departmentHeadcountGrowth = {
        departmentIds,
        min: Number.isFinite(Number(icp.departmentHeadcountGrowth.min)) ? Number(icp.departmentHeadcountGrowth.min) : undefined,
        max: Number.isFinite(Number(icp.departmentHeadcountGrowth.max)) ? Number(icp.departmentHeadcountGrowth.max) : undefined,
      };
    }
  }

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
 * sourcing. Returns null when LinkedIn doesn't report a total.
 */
export async function previewSalesNavCount(
  cfg: UnipileConfig,
  accountId: string,
  body: SalesNavSearchBody,
): Promise<number | null> {
  const page = await searchLinkedIn(cfg, accountId, body, { limit: 1 });
  return page.total;
}
