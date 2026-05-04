/**
 * Firmable API client — Australia/NZ specialist.
 *
 * REST API with Bearer token auth (`fbl_` prefix).
 * Company enrichment from domain.
 *
 * Docs: https://docs.firmable.com/api-reference/
 */

const FIRMABLE_BASE = "https://api.firmable.com";

export interface FirmableCompany {
  name: string | null;
  domain: string | null;
  industry: string | null;
  description: string | null;
  employeeCount: number | null;
  revenue: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  abn: string | null;
  linkedinUrl: string | null;
  technologies: string[] | null;
  foundedYear: number | null;
}

export function isFirmableAvailable(): boolean {
  return Boolean(process.env.FIRMABLE_API_KEY);
}

export async function enrichCompanyByDomain(
  domain: string,
): Promise<FirmableCompany | null> {
  const key = process.env.FIRMABLE_API_KEY;
  if (!key) throw new Error("FIRMABLE_API_KEY not set");

  const res = await fetch(
    `${FIRMABLE_BASE}/company?domain=${encodeURIComponent(domain)}`,
    {
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => "");
    throw new Error(`Firmable ${res.status}: ${body.slice(0, 200)}`);
  }

  const raw = await res.json();
  const data = raw?.data ?? raw;

  return {
    name: data.name ?? data.company_name ?? null,
    domain: data.domain ?? data.website ?? null,
    industry: data.industry ?? null,
    description: data.description ?? null,
    employeeCount: typeof data.employee_count === "number" ? data.employee_count
      : typeof data.employees === "number" ? data.employees : null,
    revenue: typeof data.revenue === "number" ? data.revenue : null,
    city: data.city ?? data.headquarters_city ?? null,
    state: data.state ?? data.headquarters_state ?? null,
    country: data.country ?? "Australia",
    abn: data.abn ?? null,
    linkedinUrl: data.linkedin_url ?? data.linkedin ?? null,
    technologies: Array.isArray(data.technologies) ? data.technologies : null,
    foundedYear: typeof data.founded_year === "number" ? data.founded_year
      : typeof data.founded === "number" ? data.founded : null,
  };
}
