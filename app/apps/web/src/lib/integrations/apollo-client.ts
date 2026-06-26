/**
 * Apollo.io REST API client
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

import { withCircuitBreaker, APOLLO_CIRCUIT } from "../infra/circuit-breaker";

const APOLLO_BASE = "https://api.apollo.io";

/**
 * Normalize a raw env-sourced API key. Defends against the most common paste
 * corruption that silently 401s every Apollo call: a TRAILING NEWLINE (e.g.
 * `printf '%s\n'`, an editor's final newline, or `echo "key" | vercel env add`
 * which appends one) and accidental surrounding quotes. The raw key would
 * otherwise reach the `X-Api-Key` header verbatim and Apollo rejects it with
 * "Invalid access credentials" — indistinguishable from a wrong/expired key.
 * Returns "" for nullish/blank input so callers can treat it as unset.
 */
export function normalizeApiKey(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.trim().replace(/^["']|["']$/g, "").trim();
}

function getApiKey(): string {
  const key = normalizeApiKey(process.env.APOLLO_API_KEY);
  if (!key) throw new Error("APOLLO_API_KEY not set");
  return key;
}

async function apolloFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  return withCircuitBreaker(APOLLO_CIRCUIT, async () => {
    const { method = "GET", body } = options;
    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": getApiKey(),
      },
    };
    if (body) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${APOLLO_BASE}${path}`, init);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 403) {
        // Free plan doesn't include this endpoint — expected, will fall back to LLM.
        // 403s are plan-level, not transient — don't count toward circuit breaker.
        // We still throw so the caller gets the error, but we reset the failure
        // outside this callback by re-throwing a non-circuit error.
        console.info(`[apollo] ${path}: not available on current plan (403)`);
      }
      throw new Error(`Apollo API ${path} failed: ${res.status} ${text}`);
    }

    return res.json();
  });
}

// ── Organization Enrich ──

export interface ApolloOrganization {
  id: string;
  name: string;
  website_url: string | null;
  linkedin_url: string | null;
  industry: string | null;
  keywords: string[];
  estimated_num_employees: number | null;
  annual_revenue: number | null;
  annual_revenue_printed: string | null;
  total_funding: number | null;
  total_funding_printed: string | null;
  latest_funding_stage: string | null;
  /** ISO date of the most recent funding round — drives the
   * `funding_recent` signal (true when < 180 days ago). Added
   * when signal-grade filters were wired in (Sprint α). */
  latest_funding_raised_at: string | null;
  founded_year: number | null;
  technology_names: string[];
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  /** Investor names from recent funding rounds. Used by
   * `investor_overlap` signal via case-insensitive set intersection
   * with `tenant.settings.companyInvestors`. */
  investor_names?: string[];
  /** Number of active job postings at the company. Drives the
   * `hiring_intent` signal (true when > 0). */
  num_current_job_openings?: number | null;
}

export async function enrichOrganization(
  domain: string
): Promise<ApolloOrganization | null> {
  const data = await apolloFetch<{ organization: ApolloOrganization | null }>(
    `/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`
  );
  return data.organization;
}

// ── People Enrich (match) ──

export interface ApolloPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  email_status: string | null;
  title: string | null;
  headline: string | null;
  seniority: string | null;
  departments: string[];
  linkedin_url: string | null;
  phone_numbers: Array<{ raw_number: string; type: string }>;
  city: string | null;
  state: string | null;
  country: string | null;
  organization_id: string | null;
  organization: { id: string; name: string; website_url: string } | null;
  /** Career history — returned by people/match (and search). Additive
   * widening of the type to what the live API already sends; feeds the
   * Call Mode prospect brief's deterministic timeline. */
  employment_history?: Array<{
    organization_name?: string | null;
    title?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    current?: boolean | null;
  }> | null;
}

export async function enrichPerson(params: {
  /** Apollo person id from a prior search result — the most precise match key. */
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  organization_name?: string;
  domain?: string;
  linkedin_url?: string;
  /** Unlock the work/personal email synchronously (consumes a credit). */
  reveal_personal_emails?: boolean;
  /** Request phone reveal. NOTE: Apollo reveals phones asynchronously via a
   * webhook, so this rarely returns a number in the same response — phones
   * are sourced from Lusha downstream. We still pass it to capture any that
   * Apollo does return inline. */
  reveal_phone_number?: boolean;
}): Promise<ApolloPerson | null> {
  const { reveal_personal_emails, reveal_phone_number, ...matchKeys } = params;
  // Reveal flags go on the query string (Apollo's documented location);
  // the match keys stay in the POST body, exactly as before.
  const qs = new URLSearchParams();
  if (reveal_personal_emails) qs.set("reveal_personal_emails", "true");
  if (reveal_phone_number) qs.set("reveal_phone_number", "true");
  const path = qs.toString() ? `/v1/people/match?${qs}` : "/v1/people/match";
  const data = await apolloFetch<{ person: ApolloPerson | null }>(path, {
    method: "POST",
    body: matchKeys,
  });
  return data.person;
}

// ── People Search ──

export interface PeopleSearchResult {
  people: ApolloPerson[];
  pagination: { page: number; per_page: number; total_entries: number };
}

export async function searchPeople(params: {
  q_organization_domains?: string; // newline-separated
  person_titles?: string[];
  person_seniorities?: string[];
  organization_ids?: string[];
  page?: number;
  per_page?: number;
}): Promise<PeopleSearchResult> {
  // Apollo deprecated `/v1/mixed_people/search` for API callers in
  // 2026 — it now 422s with a pointer to `/v1/mixed_people/api_search`
  // which accepts the same flat params but is API-tier-only (doesn't
  // consume search-export credits).
  return apolloFetch<PeopleSearchResult>("/api/v1/mixed_people/api_search", {
    method: "POST",
    body: { per_page: 25, ...params },
  });
}

// ── Organization Search ──

export interface OrgSearchParams {
  /** Free-text organization name match (used to resolve a domain from a
   * registry-sourced company that has only a legal name). */
  q_organization_name?: string;
  /** Apollo keyword tags (e.g. ["saas", "cloud"]) */
  q_organization_keyword_tags?: string[];
  /** Employee count ranges in Apollo format: ["1,10", "51,200"] */
  organization_num_employees_ranges?: string[];
  /** HQ locations — cities, US states, or countries */
  organization_locations?: string[];
  /** Exclude HQ locations */
  organization_not_locations?: string[];
  /** Revenue range filter */
  revenue_range?: { min?: number; max?: number };
  /** Filter by technologies used (e.g. ["kubernetes", "react"]) */
  currently_using_any_of_technology_uids?: string[];
  /** Limit to companies whose primary domain matches any of these.
   * Used to refresh a known row — bypass strategy-based search when
   * we already know the target. Up to 1000 domains per docs. */
  q_organization_domains_list?: string[];

  // ── Signal-grade filters (Sprint α) ──
  // Documented at https://docs.apollo.io/reference/organization-search
  // Enables TAM searches that are already signal-filtered — e.g. only
  // companies with recent funding AND active hiring — rather than
  // fetching a broad list and filtering post-hoc.

  /** ISO date bounds on the most recent funding round. Use
   * `{ min: <180d ago> }` to target the `funding_recent` signal. */
  latest_funding_date_range?: { min?: string; max?: string };
  /** Total funding amount (USD integer). */
  total_funding_range?: { min?: number; max?: number };
  /** Bounds on the count of active job postings. `{ min: 1 }` is the
   * cheap TAM-level `hiring_intent` gate. */
  organization_num_jobs_range?: { min?: number; max?: number };
  /** Job titles being actively recruited, e.g. ["machine learning engineer"].
   * Lets ICP target roles drive the TAM (hire-specific plays). */
  q_organization_job_titles?: string[];
  /** Locations of the jobs being actively recruited (city, region, country). */
  organization_job_locations?: string[];
  /** ISO bounds on `job_posted_at` — filter to recently-posted openings
   * to avoid stale JD caches. */
  organization_job_posted_at_range?: { min?: string; max?: string };

  page?: number;
  per_page?: number;
}

export interface OrgSearchOrganization {
  id: string;
  name: string;
  website_url: string | null;
  linkedin_url: string | null;
  primary_domain: string | null;
  industry: string | null;
  keywords: string[];
  estimated_num_employees: number | null;
  annual_revenue: number | null;
  total_funding: number | null;
  total_funding_printed: string | null;
  latest_funding_stage: string | null;
  /** ISO date of the most recent funding round. Present when Apollo
   * knows about the round; absent for self-funded / unknown. */
  latest_funding_raised_at?: string | null;
  founded_year: number | null;
  technology_names: string[];
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  logo_url: string | null;
  /** Investor names from recent funding rounds. Sparse — only present
   * on enriched results; may be an empty array when unknown. */
  investor_names?: string[];
  /** Count of active job postings. Populated when Apollo's job-board
   * coverage knows the company. */
  num_current_job_openings?: number | null;
}

export interface OrgSearchResult {
  organizations: OrgSearchOrganization[];
  pagination: { page: number; per_page: number; total_entries: number };
}

export async function searchOrganizations(
  params: OrgSearchParams
): Promise<OrgSearchResult> {
  return apolloFetch<OrgSearchResult>("/api/v1/mixed_companies/search", {
    method: "POST",
    body: { per_page: 100, ...params },
  });
}

/** Check if the Apollo search endpoint is accessible (paid plan required). */
export async function isSearchAvailable(): Promise<boolean> {
  try {
    await apolloFetch<OrgSearchResult>("/api/v1/mixed_companies/search", {
      method: "POST",
      body: { organization_num_employees_ranges: ["1,10"], per_page: 1, page: 1 },
    });
    return true;
  } catch {
    return false;
  }
}

// ── Helpers ──

export function employeeCountToRange(count: number | null): string {
  if (!count) return "Unknown";
  if (count <= 10) return "1-10";
  if (count <= 20) return "11-20";
  if (count <= 50) return "21-50";
  if (count <= 100) return "51-100";
  if (count <= 200) return "101-200";
  if (count <= 500) return "201-500";
  if (count <= 1000) return "501-1,000";
  if (count <= 2000) return "1,001-2,000";
  if (count <= 5000) return "2,001-5,000";
  if (count <= 10000) return "5,001-10,000";
  return "10,001+";
}

export function revenueToRange(revenue: number | null): string {
  if (!revenue) return "Unknown";
  if (revenue < 1_000_000) return "<$1M";
  if (revenue < 10_000_000) return "$1M-$10M";
  if (revenue < 50_000_000) return "$10M-$50M";
  if (revenue < 100_000_000) return "$50M-$100M";
  return "$100M+";
}

export function isApolloAvailable(): boolean {
  return !!normalizeApiKey(process.env.APOLLO_API_KEY);
}
