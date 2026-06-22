/**
 * Apollo sourcing types (spec 05). The neutral segment query + injected
 * dependencies. Output is the spec-01 adapter's neutral EnrichedCompany — no
 * Apollo vendor type escapes (AC3). spec-00 upsert + spec-02 meter are injected
 * (both on unmerged branches), so this module builds off main.
 */
import type { EnrichedCompany } from "@/lib/providers/company-enrichment/types";
import type { OrgSearchParams, OrgSearchResult } from "@/lib/integrations/apollo-client";

/** A sourced account — the neutral canonical shape (no vendor fields). */
export type SourcedAccount = EnrichedCompany;

/** The neutral segment query (the de-facto CanonicalICPQuery). Org facets drive
 *  account sourcing; person facets are carried for downstream contact sourcing
 *  (spec 15), not used to source accounts here. */
export interface CanonicalICPQuery {
  name?: string;
  keywords?: string[];
  employees?: { min?: number; max?: number };
  locations?: string[];
  technologies?: string[];
  revenue?: { min?: number; max?: number };
  domains?: string[];
  /** Carried for spec 15 (contact sourcing); not an account filter here. */
  personTitles?: string[];
  personSeniorities?: string[];
}

export interface MeterOp {
  workspace: string;
  kind: string;
  provider: string;
  amount: number;
  ref: string;
}

export interface SourceDeps {
  tenantId: string;
  /** Apollo org search — apollo-client.searchOrganizations in prod, a stub in tests. */
  searchOrgs(params: OrgSearchParams): Promise<OrgSearchResult>;
  /** spec-02 metering middleware (AC5); passthrough default. */
  meter<R>(op: MeterOp, fn: () => Promise<R>): Promise<R>;
  /** spec-00 upsertAccount (AC3); injected, only used in full mode. */
  upsertAccount?(tenantId: string, account: SourcedAccount): Promise<void>;
}

export interface SourceOptions {
  /** Target number of accounts; capped at APOLLO_MAX_RESULTS. */
  volume?: number;
  /** Ref prefix for idempotent metering. */
  ref?: string;
}
