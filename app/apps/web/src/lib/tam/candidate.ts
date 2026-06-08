/**
 * Discovery candidate → add-proposal mapping. Pure (so it unit-tests
 * without a DB) and source-agnostic in shape — when the multi-source
 * phase lands, SIRENE/Pappers/Zefix candidates normalise into the same
 * add-proposal payload.
 */
import {
  employeeCountToRange,
  type OrgSearchOrganization,
} from "@/lib/integrations/apollo-client";

export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
  return d || null;
}

/** Map an Apollo search org into the `add` proposal payload that
 * applyProposal() consumes to insert the company on approval. */
export function orgToAddPayload(
  org: OrgSearchOrganization,
  domain: string,
): Record<string, unknown> {
  return {
    name: org.name ?? domain,
    domain,
    industry: org.industry ?? null,
    size: org.estimated_num_employees
      ? employeeCountToRange(org.estimated_num_employees)
      : null,
    source: "apollo",
    properties: {
      apollo_id: org.id ?? null,
      logo_url: org.logo_url ?? null,
      employee_count: org.estimated_num_employees ?? null,
      country: org.country ?? null,
    },
  };
}
