/**
 * Datagma API client.
 *
 * Synchronous GET-based enrichment. Auth via query param `apiId`.
 * Company enrichment from domain: `dataType=DomainName` + `companyOnly=true`.
 *
 * Docs: https://datagmaapi.readme.io/reference
 */

const DATAGMA_BASE = "https://gateway.datagma.net/api/ingress/v2/full";

export interface DatagmaCompany {
  companyName: string | null;
  companyDomain: string | null;
  companyIndustry: string | null;
  companyDescription: string | null;
  companySize: string | null;
  companyExactEmployees: number | null;
  companyRevenue: number | null;
  companyFounded: number | null;
  companyHQ: string | null;
  companyTechStack: string[] | null;
  companyTags: string[] | null;
  companyFunding: string | null;
  companyLinkedinUrl: string | null;
  companyType: string | null;
}

export function isDatagmaAvailable(): boolean {
  return Boolean(process.env.DATAGMA_API_KEY);
}

export async function enrichCompanyByDomain(
  domain: string,
): Promise<DatagmaCompany | null> {
  const apiId = process.env.DATAGMA_API_KEY;
  if (!apiId) throw new Error("DATAGMA_API_KEY not set");

  const params = new URLSearchParams({
    apiId,
    data: domain,
    dataType: "DomainName",
    companyOnly: "true",
    companyFull: "true",
  });

  const res = await fetch(`${DATAGMA_BASE}?${params}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => "");
    throw new Error(`Datagma ${res.status}: ${body.slice(0, 200)}`);
  }

  const raw = await res.json();
  const data = raw?.data ?? raw;

  return {
    companyName: data.companyName ?? null,
    companyDomain: data.companyDomain ?? null,
    companyIndustry: data.companyIndustry ?? null,
    companyDescription: data.companyDescription ?? null,
    companySize: data.companySize ?? null,
    companyExactEmployees: typeof data.companyExactEmployees === "number" ? data.companyExactEmployees : null,
    companyRevenue: typeof data.companyRevenue === "number" ? data.companyRevenue : null,
    companyFounded: typeof data.companyFounded === "number" ? data.companyFounded : null,
    companyHQ: data.companyHQ ?? null,
    companyTechStack: Array.isArray(data.companyTechStack) ? data.companyTechStack : null,
    companyTags: Array.isArray(data.companyTags) ? data.companyTags : null,
    companyFunding: data.companyFunding ?? null,
    companyLinkedinUrl: data.companyLinkedinUrl ?? null,
    companyType: data.companyType ?? null,
  };
}
