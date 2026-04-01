/**
 * Apollo.io REST API client
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

const APOLLO_BASE = "https://api.apollo.io";

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY not set");
  return key;
}

async function apolloFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
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
    throw new Error(`Apollo API ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
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
  founded_year: number | null;
  technology_names: string[];
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
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
}

export async function enrichPerson(params: {
  email?: string;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
  domain?: string;
}): Promise<ApolloPerson | null> {
  const data = await apolloFetch<{ person: ApolloPerson | null }>(
    "/v1/people/match",
    { method: "POST", body: params }
  );
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
  return apolloFetch<PeopleSearchResult>("/v1/mixed_people/search", {
    method: "POST",
    body: { per_page: 25, ...params },
  });
}

// ── Organization Search ──

export interface OrgSearchResult {
  organizations: ApolloOrganization[];
  pagination: { page: number; per_page: number; total_entries: number };
}

export async function searchOrganizations(params: {
  q_organization_name?: string;
  q_organization_keyword_tags?: string[];
  organization_num_employees_ranges?: string[];
  organization_locations?: string[];
  page?: number;
  per_page?: number;
}): Promise<OrgSearchResult> {
  return apolloFetch<OrgSearchResult>("/api/v1/mixed_companies/search", {
    method: "POST",
    body: { per_page: 25, ...params },
  });
}

// ── Helpers ──

export function employeeCountToRange(count: number | null): string {
  if (!count) return "Unknown";
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  if (count <= 200) return "51-200";
  if (count <= 500) return "201-500";
  if (count <= 1000) return "501-1000";
  return "1000+";
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
  return !!process.env.APOLLO_API_KEY;
}
