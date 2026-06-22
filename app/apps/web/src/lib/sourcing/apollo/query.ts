/**
 * CanonicalICPQuery -> Apollo org-search request, THROUGH the spec-01 adapter
 * (spec 05, AC1, Flow A). The mapping never hand-rolls OrgSearchParams — it
 * builds the adapter's neutral CompanySearchQuery and lets the adapter own the
 * vendor request shape, so the field crosswalk lives in exactly one place.
 */
import {
  apolloCompanySearchAdapter,
  type CompanySearchQuery,
} from "@/lib/providers/apollo/search-adapter";
import type { OrgSearchParams } from "@/lib/integrations/apollo-client";
import type { CanonicalICPQuery } from "./types";

export function icpQueryToCompanySearchQuery(q: CanonicalICPQuery): CompanySearchQuery {
  return {
    name: q.name,
    keywords: q.keywords,
    employees: q.employees,
    locations: q.locations,
    technologies: q.technologies,
    revenue: q.revenue,
    domains: q.domains,
  };
}

/** The Apollo org-search params for a segment, via the spec-01 adapter. */
export function icpQueryToApolloParams(q: CanonicalICPQuery): OrgSearchParams {
  return apolloCompanySearchAdapter.toProviderRequest(icpQueryToCompanySearchQuery(q));
}
