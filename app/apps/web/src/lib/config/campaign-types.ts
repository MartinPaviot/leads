/**
 * Shared type for campaign configurations. Lives here (rather than
 * in the route file) because Next.js 15 rejects non-handler exports
 * from route.ts files at build time. The inngest worker imports
 * this type via `@/lib/campaign-types`.
 */

export interface CampaignConfig {
  segmentFilters: {
    industries?: string[];
    sizes?: string[];
    geographies?: string[];
    minScore?: number;
  };
  targetRoles: string[];
  maxCompanies: number;
  maxContactsPerCompany: number;
  status: "idle" | "preparing" | "ready" | "launched";
  preparedAt?: string;
  stats?: {
    companiesSelected: number;
    companiesEnriched: number;
    contactsFound: number;
    emailsDrafted: number;
  };
}
