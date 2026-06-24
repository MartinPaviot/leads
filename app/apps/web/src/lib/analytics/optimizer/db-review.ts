/**
 * Spec 31 — live wiring of the weekly optimization review (observe-only).
 *
 * Grounds the agent in the tenant's spec-29 campaign rollups + active spec-32
 * regression alerts, asks it for ranked metric-cited proposals, then runs the
 * pure `runWeeklyReview` (review.ts) → deterministic `routeProposal` (risk.ts).
 *
 * SAFETY: v1 is observe-only. `dbIsAutonomous` always returns false, so EVERY
 * proposal routes to the gated queue for human review — nothing is auto-applied.
 * `dbApplyChange` throws (it is never reached). Flipping on real auto-apply is a
 * deliberate follow-up: implement the per-type mutation, then gate `isAutonomous`
 * on `WEEKLY_OPTIMIZER_APPLY` + the tenant's approvalMode. The proposal audit
 * (optimizer_proposal) is the live deliverable.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db as defaultDb } from "@/db";
import { regressionAlert, optimizerProposal } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { computeCampaignRollups } from "../rollups/db-rollups";
import type { Metrics } from "../rollups/rollup";
import {
  runWeeklyReview,
  type AuditEntry,
  type ReviewAgentResult,
  type ReviewDeps,
  type ReviewResult,
} from "./review";
import { isValidProposal, type Proposal } from "./risk";

const APPLY_FLAG = "WEEKLY_OPTIMIZER_APPLY";

/** Whether real auto-apply is enabled. Reserved — v1 never mutates regardless. */
export function isOptimizerApplyEnabled(): boolean {
  return (process.env[APPLY_FLAG] ?? "").toLowerCase() === "on";
}

// ── grounding ──

export interface OptimizerAlert {
  scope: string;
  metric: string;
  current: number;
  baseline: number;
  magnitude: number;
  route: string;
}

export interface OptimizerContext {
  campaigns: Array<{ campaignId: string; metrics: Metrics }>;
  alerts: OptimizerAlert[];
}

/** Load the tenant's campaign rollups + active regression alerts as agent grounding. */
export async function loadOptimizerContext(
  tenantId: string,
  opts: { now?: number; database?: typeof defaultDb } = {},
): Promise<OptimizerContext> {
  const database = opts.database ?? defaultDb;
  const rollups = await computeCampaignRollups(tenantId, { now: opts.now, database });
  const campaigns = Object.entries(rollups.byScope).map(([campaignId, metrics]) => ({ campaignId, metrics }));

  const alertRows = await database
    .select({ alert: regressionAlert.alert })
    .from(regressionAlert)
    .where(and(eq(regressionAlert.tenantId, tenantId), eq(regressionAlert.active, true)));
  const alerts: OptimizerAlert[] = alertRows.map((r) => {
    const a = (r.alert ?? {}) as Partial<OptimizerAlert>;
    return {
      scope: a.scope ?? "",
      metric: a.metric ?? "",
      current: a.current ?? 0,
      baseline: a.baseline ?? 0,
      magnitude: a.magnitude ?? 0,
      route: a.route ?? "",
    };
  });

  return { campaigns, alerts };
}

// ── prompt + parse (pure) ──

const SYSTEM_PROMPT = `You are a GTM optimization analyst. Given a tenant's campaign metrics and active regression alerts, propose a SHORT, ranked list of concrete optimization changes.

Output MUST be valid JSON: { "proposals": [ { "id": "p1", "type": "pause|scale|copy_adjust|icp_adjust|cadence_adjust", "target": "<campaignId>", "rationale": "one sentence grounded in the data", "risk": "low|medium|high", "citedMetric": { "name": "replyRate", "value": 0.012, "scope": "<campaignId>" }, "significanceVerdict": "winner|no_significant_difference|insufficient_data|inconclusive" } ] }

Rules:
- EVERY proposal MUST cite a real metric from the input (citedMetric). A proposal with no cited metric is dropped.
- target MUST be a campaignId present in the input.
- Be conservative on risk: pausing a live campaign or scaling spend is medium/high; copy/cadence tweaks are usually low.
- Only propose scaling/pausing when the cited metric is materially above/below benchmark; otherwise mark significanceVerdict to reflect thin data.
- Propose at most 5. No filler. Return { "proposals": [] } if nothing is actionable.`;

/** Build the user prompt from the grounding context. Pure. */
export function buildOptimizerPrompt(ctx: OptimizerContext): string {
  const parts: string[] = ["## Campaign metrics (last 30 days)"];
  if (ctx.campaigns.length === 0) parts.push("(no campaigns with sends)");
  for (const c of ctx.campaigns) {
    const m = c.metrics;
    parts.push(
      `- ${c.campaignId}: sent=${m.sent} replies=${m.replies} (${(m.replyRate * 100).toFixed(1)}%) ` +
        `positive=${m.positiveReplies} (${(m.positiveRate * 100).toFixed(1)}%) ` +
        `bounceRate=${(m.bounceRate * 100).toFixed(1)}% spamRate=${(m.spamRate * 100).toFixed(2)}%`,
    );
  }
  if (ctx.alerts.length > 0) {
    parts.push("\n## Active regression alerts");
    for (const a of ctx.alerts) {
      parts.push(`- ${a.scope} ${a.metric}: ${a.current.toFixed(3)} vs baseline ${a.baseline.toFixed(3)} (${(a.magnitude * 100).toFixed(0)}% worse), route=${a.route}`);
    }
  }
  return parts.join("\n");
}

/** Extract + validate proposals from raw model output. Pure; never throws. */
export function parseProposals(rawText: string): Proposal[] {
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const list = (parsed as { proposals?: unknown }).proposals;
  if (!Array.isArray(list)) return [];
  return list.filter((p): p is Proposal => isValidProposal(p as Partial<Proposal>));
}

// ── model call (injectable for tests) ──

export type GenerateFn = (args: { system: string; user: string }) => Promise<string>;

/** Default generate — direct Anthropic call (mirrors brief-synthesizer). */
const defaultGenerate: GenerateFn = async ({ system, user }) => {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: user }],
  });
  return response.content[0]?.type === "text" ? response.content[0].text : "";
};

export interface DbRunAgentDeps {
  generate?: GenerateFn;
  database?: typeof defaultDb;
  now?: number;
}

/**
 * The spec-04-shaped agent for the weekly review: load context, prompt the
 * model, parse + validate proposals. A model error or unparseable output is a
 * returned non-result (evalPassed:false), never an exception — the review
 * treats that as "no proposals this week".
 */
export async function dbRunAgent(tenantId: string, deps: DbRunAgentDeps = {}): Promise<ReviewAgentResult> {
  const generate = deps.generate ?? defaultGenerate;
  try {
    const ctx = await loadOptimizerContext(tenantId, { now: deps.now, database: deps.database });
    const raw = await generate({ system: SYSTEM_PROMPT, user: buildOptimizerPrompt(ctx) });
    const proposals = parseProposals(raw);
    return { evalPassed: true, value: { proposals } };
  } catch (e) {
    return { evalPassed: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ── routing deps ──

/**
 * v1 observe-only: ALWAYS false → every proposal is gated for human review.
 * (Follow-up: return `isOptimizerApplyEnabled() && approvalMode === "auto"` once
 * real per-type mutations exist in dbApplyChange.) Sync to match ReviewDeps.
 */
export function dbIsAutonomous(): boolean {
  return false;
}

/** Reserved — real per-type mutation is the follow-up. Never reached in v1. */
export async function dbApplyChange(_proposal: Proposal): Promise<void> {
  throw new Error("optimizer auto-apply is not implemented (observe-only)");
}

/** Persist one reviewed proposal + its decision to the gated queue (idempotent per tenant+week+proposalId). */
export async function dbAudit(
  tenantId: string,
  week: string,
  entry: AuditEntry,
  database: typeof defaultDb = defaultDb,
): Promise<void> {
  const p = entry.proposal;
  await database
    .insert(optimizerProposal)
    .values({
      tenantId,
      week,
      proposalId: p.id,
      type: p.type,
      target: p.target,
      rationale: p.rationale,
      risk: p.risk,
      citedMetric: p.citedMetric ?? null,
      significanceVerdict: p.significanceVerdict ?? null,
      route: entry.decision.route,
      applied: entry.decision.applied && entry.outcome?.ok === true,
      reason: entry.decision.reason,
    })
    .onConflictDoUpdate({
      target: [optimizerProposal.tenantId, optimizerProposal.week, optimizerProposal.proposalId],
      set: {
        type: p.type,
        target: p.target,
        rationale: p.rationale,
        risk: p.risk,
        citedMetric: p.citedMetric ?? null,
        significanceVerdict: p.significanceVerdict ?? null,
        route: entry.decision.route,
        applied: entry.decision.applied && entry.outcome?.ok === true,
        reason: entry.decision.reason,
      },
    });
}

/**
 * Run the weekly review for one tenant and persist its proposal queue. `week`
 * keys the audit rows (idempotent re-run). Wires the pure runWeeklyReview to the
 * live grounding + (observe-only) routing.
 */
export async function runWeeklyReviewForTenant(
  tenantId: string,
  week: string,
  opts: { generate?: GenerateFn; database?: typeof defaultDb; now?: number } = {},
): Promise<ReviewResult> {
  const database = opts.database ?? defaultDb;
  const deps: ReviewDeps = {
    runAgent: () => dbRunAgent(tenantId, { generate: opts.generate, database, now: opts.now }),
    isAutonomous: dbIsAutonomous, // observe-only → always gated
    applyChange: dbApplyChange,
    audit: (entry) => dbAudit(tenantId, week, entry, database),
  };
  return runWeeklyReview(tenantId, deps);
}
