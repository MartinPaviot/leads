/**
 * Crunchbase Basic API client.
 *
 * Free tier: 200 calls/min. Returns funding rounds, investors,
 * categories, founded date, total funding for an organization.
 *
 * Docs: https://data.crunchbase.com/docs/using-the-api
 */

const CRUNCHBASE_BASE = "https://api.crunchbase.com/api/v4";

// In-memory cache with 5-min TTL to avoid re-fetching during TAM build runs.
const cache = new Map<string, { data: CrunchbaseOrganization; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface CrunchbaseFundingRound {
  announced_on: string | null;
  funding_type: string | null;
  money_raised: { value: number; currency: string } | null;
  investor_identifiers: Array<{
    value: string;
    permalink: string;
  }>;
}

export interface CrunchbaseOrganization {
  permalink: string;
  name: string | null;
  short_description: string | null;
  categories: string[];
  location_identifiers: Array<{ value: string; location_type: string }>;
  founded_on: string | null;
  num_employees_enum: string | null;
  revenue_range: string | null;
  funding_total: { value: number; currency: string } | null;
  last_funding_type: string | null;
  last_funding_at: string | null;
  investor_identifiers: Array<{ value: string; permalink: string }>;
  funding_rounds: CrunchbaseFundingRound[];
}

export function isCrunchbaseAvailable(): boolean {
  return Boolean(process.env.CRUNCHBASE_API_KEY);
}

async function crunchbaseFetch<T>(path: string): Promise<T> {
  const key = process.env.CRUNCHBASE_API_KEY;
  if (!key) throw new Error("CRUNCHBASE_API_KEY not set");

  const url = `${CRUNCHBASE_BASE}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  const fullUrl = `${url}${sep}user_key=${key}`;

  const res = await fetch(fullUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Crunchbase ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

function domainToPermalink(domain: string): string {
  return domain
    .replace(/^www\./, "")
    .split(".")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function enrichOrganization(
  domain: string,
): Promise<CrunchbaseOrganization | null> {
  const cacheKey = domain.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const permalink = domainToPermalink(domain);

  const fieldGroups = [
    "properties",
    "funding_total",
    "categories",
    "location_identifiers",
    "short_description",
    "founded_on",
    "num_employees_enum",
    "revenue_range",
    "last_funding_type",
    "last_funding_at",
    "investor_identifiers",
  ].join(",");

  try {
    const raw = await crunchbaseFetch<{ properties: Record<string, unknown> }>(
      `/entities/organizations/${permalink}?field_ids=${fieldGroups}`,
    );

    const props = raw.properties ?? {};
    const org: CrunchbaseOrganization = {
      permalink,
      name: (props.name as string) ?? null,
      short_description: (props.short_description as string) ?? null,
      categories: Array.isArray(props.categories)
        ? (props.categories as Array<{ value: string }>).map((c) => c.value)
        : [],
      location_identifiers: Array.isArray(props.location_identifiers)
        ? (props.location_identifiers as Array<{ value: string; location_type: string }>)
        : [],
      founded_on: (props.founded_on as string) ?? null,
      num_employees_enum: (props.num_employees_enum as string) ?? null,
      revenue_range: (props.revenue_range as string) ?? null,
      funding_total: (props.funding_total as { value: number; currency: string }) ?? null,
      last_funding_type: (props.last_funding_type as string) ?? null,
      last_funding_at: (props.last_funding_at as string) ?? null,
      investor_identifiers: Array.isArray(props.investor_identifiers)
        ? (props.investor_identifiers as Array<{ value: string; permalink: string }>)
        : [],
      funding_rounds: [],
    };

    cache.set(cacheKey, { data: org, expiresAt: Date.now() + CACHE_TTL_MS });
    return org;
  } catch (err) {
    if ((err as Error)?.message?.includes("404")) return null;
    throw err;
  }
}

export function crunchbaseProfileUrl(permalink: string): string {
  return `https://www.crunchbase.com/organization/${permalink}`;
}

export function crunchbaseInvestorUrl(permalink: string): string {
  return `https://www.crunchbase.com/organization/${permalink}`;
}
