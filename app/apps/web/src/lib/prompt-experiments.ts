/**
 * Prompt A/B testing — test prompt variations in production
 * and measure their impact on eval scores and user approval rates.
 *
 * An experiment defines:
 * - A base prompt and a variant prompt
 * - A traffic split (e.g., 50/50 or 90/10)
 * - Metrics to track (eval score, approval rate, time-to-approve)
 * - Duration (auto-disable after N days)
 *
 * Integration points:
 * - `assignExperimentVariant()` — called by the chat route to decide
 *   which prompt to serve for a given tenant
 * - `recordExperimentMetric()` — called by the traced-ai layer and
 *   approval flow to log outcomes per variant
 * - `getActiveExperiment()` — called by the system prompt builder to
 *   check if a variant delta should be applied
 * - `concludeExpiredExperiments()` — cron job to auto-conclude and
 *   compute winners
 */

import { db } from "@/db";
import { promptExperiments, promptExperimentMetrics } from "@/db/schema";
import { eq, and, lte, gte, sql } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────

export interface PromptExperiment {
  id: string;
  agentId: string;
  name: string;
  basePromptHash: string;
  variantPromptDelta: string;
  trafficPercent: number;
  startsAt: string;
  endsAt: string;
  status: "active" | "concluded" | "canceled";
  results?: ExperimentResults;
}

export interface ExperimentResults {
  baseEvalScore: number;
  variantEvalScore: number;
  baseApprovalRate: number;
  variantApprovalRate: number;
  sampleSize: number;
  winner: "base" | "variant" | "inconclusive";
}

// ─── Variant Assignment ─────────────────────────────────────

/**
 * Deterministic variant assignment using a hash of tenantId + experimentId.
 * This ensures:
 *   1. The same tenant always gets the same variant within an experiment
 *   2. Different experiments can assign the same tenant differently
 *   3. No randomness needed — reproducible for debugging
 *
 * The hash is computed using a simple FNV-1a-like algorithm (no crypto
 * dependency needed for this — we just need uniform distribution, not
 * security).
 */
export function assignExperimentVariant(
  tenantId: string,
  experimentId: string,
  trafficPercent: number = 50,
): "base" | "variant" {
  // FNV-1a inspired hash — produces a 32-bit unsigned integer
  const key = `${tenantId}:${experimentId}`;
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, keep as uint32
  }

  // Map hash to 0-99 range and compare against traffic split
  const bucket = hash % 100;
  return bucket < trafficPercent ? "variant" : "base";
}

// ─── Metric Recording ───────────────────────────────────────

/**
 * Record a metric observation for an experiment arm.
 *
 * Metrics:
 * - "eval_score": 0.0-1.0 composite eval score for this turn
 * - "approved": 1.0 when user approves an agent action without editing
 * - "rejected": 1.0 when user rejects or significantly edits
 */
export async function recordExperimentMetric(
  tenantId: string,
  experimentId: string,
  variant: "base" | "variant",
  metric: "eval_score" | "approved" | "rejected",
  value: number,
): Promise<void> {
  await db.insert(promptExperimentMetrics).values({
    experimentId,
    tenantId,
    variant,
    metric,
    value,
  });
}

// ─── Active Experiment Lookup ───────────────────────────────

/**
 * Get the currently active experiment for an agent, if any.
 * Returns null if no experiment is running for this agent.
 *
 * Only one experiment per agent should be active at a time.
 * If multiple are found (misconfiguration), the most recently
 * created one wins.
 */
export async function getActiveExperiment(
  agentId: string,
): Promise<PromptExperiment | null> {
  const now = new Date();

  const rows = await db
    .select()
    .from(promptExperiments)
    .where(
      and(
        eq(promptExperiments.agentId, agentId),
        eq(promptExperiments.status, "active"),
        lte(promptExperiments.startsAt, now),
        gte(promptExperiments.endsAt, now),
      ),
    )
    .orderBy(sql`${promptExperiments.createdAt} desc`)
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    basePromptHash: row.basePromptHash,
    variantPromptDelta: row.variantPromptDelta,
    trafficPercent: row.trafficPercent,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    results: row.results as ExperimentResults | undefined,
  };
}

// ─── Prompt Delta Application ───────────────────────────────

/**
 * Apply a variant prompt delta to a system prompt.
 *
 * The delta is appended as a new instruction block at the end of the
 * system prompt, wrapped in an <experiment_override> tag so the LLM
 * treats it as a higher-priority instruction that overrides conflicting
 * base instructions.
 *
 * This approach is intentionally additive rather than destructive —
 * the base prompt stays intact, and the variant adds or overrides
 * specific behaviors. This makes experiments safe to run and easy
 * to debug.
 */
export function applyPromptDelta(
  basePrompt: string,
  variantDelta: string,
): string {
  return `${basePrompt}

<experiment_override>
The following instructions take priority over any conflicting instructions above.
This is part of a controlled experiment to improve response quality.

${variantDelta}
</experiment_override>`;
}

// ─── Experiment Lifecycle ───────────────────────────────────

/**
 * Conclude expired experiments and compute winners.
 * Called by a cron job or manually from the admin panel.
 *
 * For each expired-but-still-active experiment:
 * 1. Aggregate metrics per variant
 * 2. Compute eval scores and approval rates
 * 3. Determine winner (variant wins if it beats base by >= 5%)
 * 4. Update experiment status to "concluded" with results
 */
export async function concludeExpiredExperiments(): Promise<number> {
  const now = new Date();

  // Find active experiments that have passed their end date
  const expired = await db
    .select()
    .from(promptExperiments)
    .where(
      and(
        eq(promptExperiments.status, "active"),
        lte(promptExperiments.endsAt, now),
      ),
    );

  let concluded = 0;

  for (const exp of expired) {
    // Aggregate metrics per variant
    const metrics = await db
      .select({
        variant: promptExperimentMetrics.variant,
        metric: promptExperimentMetrics.metric,
        avgValue: sql<number>`avg(${promptExperimentMetrics.value})`,
        count: sql<number>`count(*)`,
      })
      .from(promptExperimentMetrics)
      .where(eq(promptExperimentMetrics.experimentId, exp.id))
      .groupBy(promptExperimentMetrics.variant, promptExperimentMetrics.metric);

    // Build results
    let baseEvalScore = 0;
    let variantEvalScore = 0;
    let baseApproved = 0;
    let baseRejected = 0;
    let variantApproved = 0;
    let variantRejected = 0;
    let totalSamples = 0;

    for (const m of metrics) {
      totalSamples += Number(m.count);
      if (m.variant === "base") {
        if (m.metric === "eval_score") baseEvalScore = Number(m.avgValue);
        if (m.metric === "approved") baseApproved = Number(m.count);
        if (m.metric === "rejected") baseRejected = Number(m.count);
      } else {
        if (m.metric === "eval_score") variantEvalScore = Number(m.avgValue);
        if (m.metric === "approved") variantApproved = Number(m.count);
        if (m.metric === "rejected") variantRejected = Number(m.count);
      }
    }

    const baseTotal = baseApproved + baseRejected;
    const variantTotal = variantApproved + variantRejected;
    const baseApprovalRate = baseTotal > 0 ? baseApproved / baseTotal : 0;
    const variantApprovalRate = variantTotal > 0 ? variantApproved / variantTotal : 0;

    // Winner logic: variant wins if it beats base by >= 5% on either metric
    // and doesn't lose by >= 5% on the other. Inconclusive if the delta is
    // within 5% on both metrics or if sample size is too small.
    const MIN_SAMPLES = 20;
    let winner: "base" | "variant" | "inconclusive" = "inconclusive";

    if (totalSamples >= MIN_SAMPLES) {
      const evalDelta = variantEvalScore - baseEvalScore;
      const approvalDelta = variantApprovalRate - baseApprovalRate;

      if (evalDelta >= 0.05 && approvalDelta >= -0.05) {
        winner = "variant";
      } else if (evalDelta <= -0.05 && approvalDelta <= 0.05) {
        winner = "base";
      }
      // Otherwise inconclusive — one metric up, one down, or both within noise
    }

    const results: ExperimentResults = {
      baseEvalScore,
      variantEvalScore,
      baseApprovalRate,
      variantApprovalRate,
      sampleSize: totalSamples,
      winner,
    };

    await db
      .update(promptExperiments)
      .set({
        status: "concluded",
        results,
        updatedAt: now,
      })
      .where(eq(promptExperiments.id, exp.id));

    concluded++;
  }

  return concluded;
}

// ─── Convenience: Get variant for chat route ────────────────

/**
 * High-level helper for the chat route. Checks if there is an active
 * experiment for the "chat" agent, assigns the tenant to a variant,
 * and returns the prompt delta to apply (or null for base).
 *
 * Usage in the chat route:
 *   const delta = await getChatExperimentDelta(tenantId);
 *   if (delta) systemPrompt = applyPromptDelta(systemPrompt, delta);
 */
export async function getChatExperimentDelta(
  tenantId: string,
): Promise<{ experimentId: string; variant: "base" | "variant"; delta: string | null } | null> {
  const experiment = await getActiveExperiment("chat");
  if (!experiment) return null;

  const variant = assignExperimentVariant(tenantId, experiment.id, experiment.trafficPercent);

  return {
    experimentId: experiment.id,
    variant,
    delta: variant === "variant" ? experiment.variantPromptDelta : null,
  };
}
