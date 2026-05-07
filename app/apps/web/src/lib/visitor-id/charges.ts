/**
 * Charge ledger helpers for visitor-ID provider calls (P0-2 follow-up).
 *
 * Pairs with `lib/visitor-id/spend-cap.ts` :
 *   - Cap evaluation : reads `sum(cost_usd)` from this ledger when
 *     it has rows, falls back to estimated count × default-rate
 *     when empty. Lets the cap be exact for any tenant whose
 *     ledger has been populated.
 *   - Charge writes : the worker calls `recordCharge` after every
 *     paid provider call (whether matched or not) ; cache hits
 *     skip since they cost nothing.
 *
 * Pure where possible. The DB write is wrapped behind a pluggable
 * `deps.insertCharge` for testability.
 */

const DEFAULT_RATE_PER_MATCH_USD = 0.06;
const RESPONSE_META_BUDGET_BYTES = 1024;

export interface ChargeInput {
  tenantId: string;
  visitId: string | null;
  provider: string;
  /** True when the provider returned a match. The default rate is
   *  charged even on no-match if the provider charges per lookup. */
  matched: boolean;
  /** Per-call rate in USD ; defaults to DEFAULT_RATE_PER_MATCH_USD
   *  when null. Provider-aware callers can pass the tier rate. */
  ratePerCallUsd?: number | null;
  /** Provider response metadata. Bounded to 1KB on serialise. */
  responseMeta?: Record<string, unknown>;
}

export interface ChargeRow {
  tenantId: string;
  visitId: string | null;
  provider: string;
  costUsd: number | null;
  matched: boolean;
  responseMeta: Record<string, unknown>;
}

/**
 * Build the charge row that goes into the ledger. Pure ; the
 * worker passes this directly to `db.insert`.
 */
export function buildChargeRow(input: ChargeInput): ChargeRow {
  const rate = input.ratePerCallUsd ?? DEFAULT_RATE_PER_MATCH_USD;
  const cost =
    Number.isFinite(rate) && rate >= 0
      ? Math.round(rate * 1_000_000) / 1_000_000
      : null;
  return {
    tenantId: input.tenantId,
    visitId: input.visitId,
    provider: input.provider,
    costUsd: cost,
    matched: input.matched,
    responseMeta: capResponseMeta(input.responseMeta ?? {}),
  };
}

/**
 * Cap the responseMeta jsonb to 1KB. Cheap heuristic via JSON
 * length ; on overflow we drop everything and substitute a
 * `{ truncated: true, byteLength }` marker. Provider responses
 * larger than 1KB are almost always payload bloat (logos, nested
 * SDK objects) and the cap protects the row size.
 */
export function capResponseMeta(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  let serialized: string;
  try {
    serialized = JSON.stringify(meta);
  } catch {
    return { truncated: true, reason: "non_serialisable" };
  }
  if (Buffer.byteLength(serialized, "utf8") <= RESPONSE_META_BUDGET_BYTES) {
    return meta;
  }
  return {
    truncated: true,
    byteLength: Buffer.byteLength(serialized, "utf8"),
  };
}

/**
 * Spend reader that consults the ledger. Pluggable DB so tests
 * inject a stub. Returns null when the ledger has no rows for the
 * tenant in the window (caller falls back to estimated count).
 */
export interface LedgerDeps {
  sumChargesThisMonth: (
    tenantId: string,
    now: Date,
  ) => Promise<{ totalUsd: number; rowCount: number }>;
}

export async function loadActualSpendUsd(args: {
  tenantId: string;
  now?: Date;
  deps: LedgerDeps;
}): Promise<{ spendUsd: number | null; rowCount: number }> {
  const now = args.now ?? new Date();
  const summary = await args.deps.sumChargesThisMonth(args.tenantId, now);
  if (!summary || summary.rowCount === 0) {
    return { spendUsd: null, rowCount: 0 };
  }
  // Round to 2 decimals for display + comparison parity with the
  // estimated path.
  const rounded = Math.round(summary.totalUsd * 100) / 100;
  return { spendUsd: rounded, rowCount: summary.rowCount };
}

export const CHARGES_CONSTANTS = {
  DEFAULT_RATE_PER_MATCH_USD,
  RESPONSE_META_BUDGET_BYTES,
};
