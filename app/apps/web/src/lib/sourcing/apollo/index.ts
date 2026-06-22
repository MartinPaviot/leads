// Apollo account sourcing (spec 05, _specs/05-sourcing-apollo). Sources
// canonical accounts for a segment via the merged spec-01 adapter, with a
// credit-free count-only mode for TAM estimation. spec-00 upsert + spec-02 meter
// are injected (RECONCILE.md decisions).
export { sourceAccounts, countAccounts, APOLLO_PAGE_SIZE, APOLLO_MAX_RESULTS } from "./source";
export { icpQueryToCompanySearchQuery, icpQueryToApolloParams } from "./query";
export type { CanonicalICPQuery, SourcedAccount, SourceDeps, SourceOptions, MeterOp } from "./types";

import type { MeterOp } from "./types";

/** Passthrough meter for composition when budget enforcement isn't wired yet. */
export async function passthroughMeter<R>(_op: MeterOp, fn: () => Promise<R>): Promise<R> {
  return fn();
}
