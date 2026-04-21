import type { ApolloOrganization, OrgSearchOrganization } from "@/lib/apollo-client";
import type { SignalKey, SignalPayload } from "@/lib/tam-stream/events";

/** Tenant-scoped context a signal needs in addition to the company
 * row. Built once at the start of a build run and passed to every
 * per-company pipeline so we don't re-query tenant settings N times. */
export interface SignalContext {
  tenantId: string;
  /** Lowercased, trimmed set for O(1) overlap checks with Apollo's
   * `investor_names`. Empty when the tenant hasn't filled its cap table. */
  tenantInvestors: Set<string>;
  /** ICP projection from tenant settings, pre-flattened into the shape
   * `calculateFitScore` expects. Cached on the ctx to avoid re-parsing
   * `targetCompanySizes` etc. for every company. */
  icp: {
    industries?: string[];
    sizeRange?: [number, number];
    revenueRange?: [number, number];
    geographies?: string[];
    technologies?: string[];
  };
  /** Frozen at the start of the run so all signals use the same
   * reference "now" — makes funding_recent deterministic within a build. */
  now: Date;
}

/** Union of what a signal might see. Search results are always
 * present; enrichment is best-effort and may be null when Apollo's
 * enrich endpoint fails or rate-limits. */
export interface SignalInput {
  search: OrgSearchOrganization;
  enriched: ApolloOrganization | null;
}

/** A detector is a pure async function. It must never throw — wrap
 * network calls in try/catch and return an `indeterminate` payload
 * on failure. The stream handler only surfaces errors via the
 * `error` event, not via broken chips. */
export type SignalDetector = (
  input: SignalInput,
  ctx: SignalContext,
) => Promise<SignalPayload>;

export interface RegisteredSignal {
  key: SignalKey;
  detector: SignalDetector;
}
