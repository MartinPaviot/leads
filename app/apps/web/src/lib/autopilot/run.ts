/**
 * Spec 37 (B4.2 core) — the per-tenant daily-autopilot orchestration, with every
 * IO injected so it's unit-testable without a db/cron. The thin Inngest wrapper
 * (inngest/daily-autopilot.ts) supplies the real deps + the tenant loop.
 *
 * The Monaco loop, in order: warmup-aware budget over the managed pool → top
 * signal-ranked targeted candidates → select up to budget (excluding already-
 * enrolled/suppressed) → per prospect: refresh signals + grounded copy, then
 * enroll (auto) or draft (review/batch). Every send still passes evaluateSend at
 * transport; nothing here bypasses a guardrail.
 *
 * Blast radius: lib/autopilot/* only.
 */

import { resolveAutopilotBudget } from "./budget";
import { selectProspects } from "./select";
import { decideAutopilotEnrollment, type AutopilotEnrollAction } from "./enroll-decision";
import type { CapacityReport } from "@/lib/sending/identity/capacity";
import type { CandidatePool } from "./candidates";
import type { ApprovalModeV2 } from "@/lib/guardrails/approval-mode";
import type { EnrollOutcome } from "./enroll";

export type AutopilotSkip = "no_capacity" | "budget_zero" | "no_active_sequence" | "no_candidates";

export interface TenantAutopilotSummary {
  tenantId: string;
  budget: number;
  selected: number;
  /** Successful prepare() calls — the per-run LLM-call lower bound. Structurally ≤ budget. */
  prepared: number;
  enrolled: number;
  drafted: number;
  /** Per-prospect prepare/enroll failures that were isolated (the run continued). */
  errors: number;
  skipped?: AutopilotSkip;
}

export interface TenantAutopilotConfig {
  configBudget: number;
  maxEmailsPerDay: number | null;
  approvalMode: ApprovalModeV2;
  autopilotAutoEnroll?: boolean;
}

export interface RunAutopilotDeps {
  loadCapacity: (tenantId: string) => Promise<CapacityReport>;
  getConfig: (tenantId: string) => Promise<TenantAutopilotConfig>;
  /** Autopilot sends already enrolled today (for the per-day budget; re-run safety). */
  spentToday: (tenantId: string) => Promise<number>;
  getActiveSequenceId: (tenantId: string) => Promise<string | null>;
  loadCandidates: (tenantId: string, limit: number) => Promise<CandidatePool>;
  prepare: (tenantId: string, contactId: string, companyId: string) => Promise<unknown>;
  enroll: (input: {
    tenantId: string;
    contactId: string;
    sequenceId: string;
    action: AutopilotEnrollAction;
    draftPayload?: Record<string, unknown>;
  }) => Promise<{ outcome: EnrollOutcome }>;
  /** Candidate pool buffer over the budget (so exclusions don't starve it). Default 4, capped 1000. */
  poolMultiplier?: number;
  /**
   * Consecutive prepare/enroll failures before the per-tenant loop bails. A run of
   * back-to-back errors means the tenant is broken (LLM budget exhausted, sequence
   * deleted mid-run, …) — keep going and we just burn calls. Default 5.
   */
  maxConsecutiveErrors?: number;
}

export async function runAutopilotForTenant(tenantId: string, deps: RunAutopilotDeps): Promise<TenantAutopilotSummary> {
  const base = { tenantId, budget: 0, selected: 0, prepared: 0, enrolled: 0, drafted: 0, errors: 0 };

  // 1. Warmup-aware capacity → budget (clamped to capacity + the legacy floor − spent).
  const capacity = await deps.loadCapacity(tenantId);
  if (capacity.totalAvailable <= 0) return { ...base, skipped: "no_capacity" };

  const cfg = await deps.getConfig(tenantId);
  const spent = await deps.spentToday(tenantId);
  const budget = resolveAutopilotBudget({ configBudget: cfg.configBudget, maxEmailsPerDay: cfg.maxEmailsPerDay, capacity, spentToday: spent });
  if (budget.email <= 0) return { ...base, skipped: "budget_zero" };

  // 2. The enrollment target.
  const sequenceId = await deps.getActiveSequenceId(tenantId);
  if (!sequenceId) return { ...base, budget: budget.email, skipped: "no_active_sequence" };

  // 3. Signal-ranked candidates → select the top `budget` (excluding enrolled/suppressed).
  const limit = Math.min(budget.email * (deps.poolMultiplier ?? 4), 1000);
  const pool = await deps.loadCandidates(tenantId, limit);
  const selected = selectProspects(pool.candidates, budget.email, {
    isAlreadyEnrolled: (c) => pool.alreadyEnrolledContactIds.has(c.contactId),
    isSuppressed: (c) => pool.suppressedContactIds.has(c.contactId),
  });
  if (selected.length === 0) return { ...base, budget: budget.email, skipped: "no_candidates" };

  // 4. Approval mode → auto-enroll or draft.
  const action = decideAutopilotEnrollment(cfg.approvalMode, { autopilotAutoEnroll: cfg.autopilotAutoEnroll });

  // 5. Per prospect (bounded by selected ⊆ budget): refresh+ground, then enroll/draft.
  // Each prospect is fault-isolated: one failure (LLM hiccup, transient db) is
  // counted and skipped, not allowed to abort the tenant. A run of consecutive
  // failures trips the breaker — the tenant is broken, stop burning calls.
  const maxConsecutive = deps.maxConsecutiveErrors ?? 5;
  let prepared = 0;
  let enrolled = 0;
  let drafted = 0;
  let errors = 0;
  let consecutive = 0;
  for (const p of selected) {
    try {
      await deps.prepare(tenantId, p.contactId, p.companyId);
      prepared++;
      const r = await deps.enroll({ tenantId, contactId: p.contactId, sequenceId, action, draftPayload: { companyId: p.companyId } });
      if (r.outcome === "enrolled") enrolled++;
      else if (r.outcome === "drafted") drafted++;
      consecutive = 0;
    } catch {
      errors++;
      consecutive++;
      if (consecutive >= maxConsecutive) break;
    }
  }
  return { tenantId, budget: budget.email, selected: selected.length, prepared, enrolled, drafted, errors };
}
