/**
 * Per-tenant spend cap for visitor-ID identification (P0-2 task 2.1).
 *
 * Snitcher charges per resolved company (~$0.04-0.10 depending on
 * volume tier). Without a cap, a single noisy crawler campaign or a
 * compromised pixel can spike costs into the hundreds in a day.
 *
 * The cap is a per-tenant per-month dollar limit. Default $50 — Monaco-
 * style conservative ; tenants on the higher pricing tier can override
 * via `tenants.settings.snitcherMonthlyCapUsd`. The Inngest worker
 * consults `isCapReached(tenantId)` BEFORE calling the provider ; once
 * exceeded, the worker short-circuits with `skipped: "cap_reached"` and
 * the visit row stays unmatched until the next billing month.
 *
 * Pure functions where we can — the actual count needs a DB query, so
 * we expose two layers :
 *   - `computeMonthlySpendUsd({ identifications, ratePerMatchUsd })` —
 *     pure, takes the count + rate as inputs.
 *   - `isCapReached(args)` — pure decider, takes spend + cap.
 *   - `loadMonthlySpendUsd(tenantId, deps)` — DB-backed wrapper that
 *     the worker calls. Pluggable `deps.countIdentifications` so tests
 *     stub it without spinning Postgres.
 */

const DEFAULT_CAP_USD = 50;
const DEFAULT_RATE_PER_MATCH_USD = 0.06; // mid-tier Snitcher pricing

export interface SpendInputs {
  identifications: number;
  ratePerMatchUsd?: number;
}

export interface SpendDecision {
  spendUsd: number;
  capUsd: number;
  reached: boolean;
  /** Headroom expressed as (cap - spend) ; never negative. */
  remainingUsd: number;
  /** True when within $5 of the cap — used to surface a warning
   *  banner in the dashboard before identifications stop. */
  warning: boolean;
}

export function computeMonthlySpendUsd(args: SpendInputs): number {
  const rate = args.ratePerMatchUsd ?? DEFAULT_RATE_PER_MATCH_USD;
  if (!Number.isFinite(args.identifications) || args.identifications < 0) {
    return 0;
  }
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return Math.round(args.identifications * rate * 100) / 100;
}

export function resolveCapUsd(
  settings: Record<string, unknown> | null | undefined,
): number {
  if (!settings || typeof settings !== "object") return DEFAULT_CAP_USD;
  const raw = (settings as Record<string, unknown>).snitcherMonthlyCapUsd;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_CAP_USD;
  if (raw < 0) return DEFAULT_CAP_USD; // negative is nonsense → fall back
  // Hard ceiling 5000 USD/mo prevents a misconfigured tenant from
  // unlimited blow-up. A larger account renegotiates the cap with
  // billing rather than self-serving past 5K.
  return Math.min(5000, raw);
}

export function evaluateSpend(
  spendUsd: number,
  capUsd: number,
): SpendDecision {
  const reached = spendUsd >= capUsd;
  const remainingUsd = Math.max(0, Math.round((capUsd - spendUsd) * 100) / 100);
  // Warning when within either $5 absolute OR 10% of the cap, whichever
  // is larger — small caps need a tighter buffer.
  const buffer = Math.max(5, capUsd * 0.1);
  const warning = !reached && remainingUsd <= buffer;
  return { spendUsd, capUsd, reached, remainingUsd, warning };
}

export function isCapReached(args: {
  spendUsd: number;
  capUsd: number;
}): boolean {
  return evaluateSpend(args.spendUsd, args.capUsd).reached;
}

/**
 * DB-backed wrapper used by the Inngest worker. Pluggable so tests
 * inject a stub. Returns a SpendDecision so the caller has the full
 * picture (current spend, cap, headroom) for telemetry.
 */
export interface SpendDeps {
  countIdentificationsThisMonth: (
    tenantId: string,
    now: Date,
  ) => Promise<number>;
  loadTenantSettings: (
    tenantId: string,
  ) => Promise<Record<string, unknown> | null>;
  /** P0-2 follow-up : ledger-first spend computation. When the
   *  charge ledger has rows for the tenant in the month, sum
   *  cost_usd directly — exact spend, survives provider rate
   *  changes. When 0 rows (legacy tenant pre-ledger), caller
   *  falls back to count × rate estimation. */
  sumChargesThisMonth?: (
    tenantId: string,
    now: Date,
  ) => Promise<{ totalUsd: number; rowCount: number }>;
}

export async function loadSpendDecision(args: {
  tenantId: string;
  now?: Date;
  deps: SpendDeps;
  ratePerMatchUsd?: number;
}): Promise<SpendDecision> {
  const now = args.now ?? new Date();
  const [count, settings, ledger] = await Promise.all([
    args.deps.countIdentificationsThisMonth(args.tenantId, now),
    args.deps.loadTenantSettings(args.tenantId),
    args.deps.sumChargesThisMonth
      ? args.deps.sumChargesThisMonth(args.tenantId, now)
      : Promise.resolve(null),
  ]);
  // Ledger-first : when the ledger has rows, use sum(cost_usd) as
  // the authoritative spend. Otherwise fall back to count × rate.
  const spend =
    ledger && ledger.rowCount > 0
      ? Math.round(ledger.totalUsd * 100) / 100
      : computeMonthlySpendUsd({
          identifications: count,
          ratePerMatchUsd: args.ratePerMatchUsd,
        });
  const cap = resolveCapUsd(settings);
  return evaluateSpend(spend, cap);
}

/**
 * Compute the start-of-month UTC timestamp for the date passed in.
 * Used by the count query so tests don't depend on real-clock.
 */
export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
