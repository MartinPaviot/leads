/**
 * Per-tenant LLM budget enforcement.
 *
 * Cost tracking already lands in `usage_events` via `trackTokenUsage`
 * after each call. This module adds the *pre-dispatch* check so we
 * reject work before the LLM fires when a tenant has exceeded their
 * monthly cap — important for confident autonomy: the user can let
 * the system run overnight without waking to a $500 surprise.
 *
 * Flow:
 *   tracedGenerateText/Object/streamText
 *     ↓ (new)
 *   enforceLlmBudget(tenantId)
 *     ↓ passes                                ↓ exceeds
 *   proceed with LLM call                     throw BudgetExceededError
 *                                             (caller surfaces to user)
 */

import { getTenantCost } from "./cost-tracker";
import { getTenantSettings } from "./tenant-settings";
import logger from "./logger";

export interface BudgetStatus {
  /** When false, the call should be rejected. */
  allowed: boolean;
  /** USD spent in the current calendar month. */
  spentUsd: number;
  /** USD cap in effect. 0 ⇒ no cap (tenant has no limit configured). */
  capUsd: number;
  /** Percentage of cap used (0–100+). Null when no cap. */
  percentUsed: number | null;
  /** Human-readable reason when !allowed. */
  reason?: string;
}

export class BudgetExceededError extends Error {
  readonly status: BudgetStatus;
  constructor(status: BudgetStatus) {
    super(status.reason ?? "LLM monthly budget exceeded");
    this.name = "BudgetExceededError";
    this.status = status;
  }
}

/**
 * First moment of the current calendar month in UTC. Matches what
 * `trackTokenUsage` inserts via `new Date()` — we aggregate from that
 * boundary so every tenant gets a clean reset on the 1st.
 */
function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Cache layer. LLM calls fire at ~100-1000/min at peak; re-reading the
 * tenant settings + summing `usage_events` on every one is wasteful.
 * We memoise status for 30s per tenant — budget overruns are never
 * missed by more than that window, which is tight enough to stop
 * runaway loops and loose enough to keep throughput high.
 */
const STATUS_TTL_MS = 30_000;
const cache = new Map<string, { status: BudgetStatus; expiresAt: number }>();

export function clearBudgetCacheForTest(): void {
  cache.clear();
}

export async function getLlmBudgetStatus(tenantId: string): Promise<BudgetStatus> {
  const now = Date.now();
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.status;

  let capUsd = 0;
  try {
    const settings = await getTenantSettings(tenantId);
    const configured = settings.llmMonthlyCostCapUsd;
    if (typeof configured === "number" && configured > 0) capUsd = configured;
  } catch (err) {
    // Missing settings must not block LLM work. Fail open and log.
    logger.warn("[llm-budget] failed to read tenant settings", { tenantId, err });
  }

  // No cap → skip the aggregation entirely. Saves a query per call
  // for every tenant on the free plan.
  if (capUsd <= 0) {
    const status: BudgetStatus = {
      allowed: true,
      spentUsd: 0,
      capUsd: 0,
      percentUsed: null,
    };
    cache.set(tenantId, { status, expiresAt: now + STATUS_TTL_MS });
    return status;
  }

  let spentUsd = 0;
  try {
    const totals = await getTenantCost(tenantId, startOfMonthUtc());
    spentUsd = totals.totalCost;
  } catch (err) {
    // Aggregation error → fail open (better to let the call through
    // than block a user because we can't read the ledger).
    logger.warn("[llm-budget] failed to aggregate usage", { tenantId, err });
    const status: BudgetStatus = {
      allowed: true,
      spentUsd: 0,
      capUsd,
      percentUsed: null,
    };
    cache.set(tenantId, { status, expiresAt: now + STATUS_TTL_MS });
    return status;
  }

  const allowed = spentUsd < capUsd;
  const status: BudgetStatus = {
    allowed,
    spentUsd,
    capUsd,
    percentUsed: Math.min(999, (spentUsd / capUsd) * 100),
    reason: allowed
      ? undefined
      : `Monthly AI budget cap reached ($${spentUsd.toFixed(2)} / $${capUsd.toFixed(2)}). Raise the cap under Settings → Workspace or wait until the 1st.`,
  };

  cache.set(tenantId, { status, expiresAt: now + STATUS_TTL_MS });
  return status;
}

/**
 * Throws `BudgetExceededError` when the tenant has blown through their
 * monthly cap. Does nothing when no cap is configured or the cap is
 * not yet reached. Uses the cached status from `getLlmBudgetStatus`.
 */
export async function enforceLlmBudget(tenantId: string | undefined): Promise<void> {
  if (!tenantId) return; // cross-cutting infra calls without tenant context are always allowed
  const status = await getLlmBudgetStatus(tenantId);
  if (!status.allowed) throw new BudgetExceededError(status);
}

/**
 * Invalidate the cached status for a tenant — call after raising the
 * cap in settings so the next LLM call sees fresh numbers without
 * waiting 30s for the TTL.
 */
export function invalidateBudgetCache(tenantId: string): void {
  cache.delete(tenantId);
}
