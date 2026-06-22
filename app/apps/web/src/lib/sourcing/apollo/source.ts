/**
 * Apollo account sourcing (spec 05). Paginates Apollo org search via the spec-01
 * adapter, normalizes each result to a canonical account (no vendor type past
 * fromProviderResponse, AC3), persists via the injected spec-00 upsert, and
 * meters every call against the segment budget (AC5). Count-only mode is a
 * single credit-free call for TAM estimation (AC2). No enrichment here (AC4).
 */
import { apolloCompanySearchAdapter } from "@/lib/providers/apollo/search-adapter";
import { icpQueryToApolloParams } from "./query";
import type { CanonicalICPQuery, SourceDeps, SourceOptions, SourcedAccount } from "./types";

export const APOLLO_PAGE_SIZE = 100;
/** Apollo caps pagination well below total_entries; never page past this. */
export const APOLLO_MAX_RESULTS = 50_000;

/**
 * Count-only TAM estimate (AC2). One metered `per_page=1` call reading
 * total_entries — no pages fetched, no enrichment, no credits beyond the search.
 */
export async function countAccounts(
  query: CanonicalICPQuery,
  deps: SourceDeps,
  ref = "count",
): Promise<{ total: number; capped: boolean }> {
  const base = icpQueryToApolloParams(query);
  const result = await deps.meter(
    { workspace: deps.tenantId, kind: "sourcing.count", provider: "apollo", amount: 1, ref: `${ref}:count` },
    () => deps.searchOrgs({ ...base, per_page: 1, page: 1 }),
  );
  const total = result.pagination?.total_entries ?? 0;
  return { total, capped: total >= APOLLO_MAX_RESULTS };
}

/**
 * Source accounts (full mode, AC1/AC3/AC4/AC5). Yields up to
 * min(volume, total_entries, 50000) canonical accounts. Resumable by page;
 * stops at the target, the last short page, or the 50k ceiling.
 */
export async function* sourceAccounts(
  query: CanonicalICPQuery,
  deps: SourceDeps,
  opts: SourceOptions = {},
): AsyncIterable<SourcedAccount> {
  const base = icpQueryToApolloParams(query);
  const target = Math.min(opts.volume ?? 1000, APOLLO_MAX_RESULTS);
  const ref = opts.ref ?? "source";
  const maxPages = Math.ceil(target / APOLLO_PAGE_SIZE);
  let yielded = 0;

  for (let page = 1; page <= maxPages && yielded < target; page++) {
    const result = await deps.meter(
      { workspace: deps.tenantId, kind: "sourcing.search", provider: "apollo", amount: 1, ref: `${ref}:p${page}` },
      () => deps.searchOrgs({ ...base, per_page: APOLLO_PAGE_SIZE, page }),
    );
    const orgs = result.organizations ?? [];
    for (const org of orgs) {
      if (yielded >= target) break;
      // AC3 — normalize through the adapter; no Apollo type escapes here.
      const account = apolloCompanySearchAdapter.fromProviderResponse(org);
      // AC4 — search only; persistence is the canonical upsert, never enrichment.
      if (deps.upsertAccount) await deps.upsertAccount(deps.tenantId, account);
      yield account;
      yielded++;
    }
    if (orgs.length < APOLLO_PAGE_SIZE) break; // last page reached
  }
}
