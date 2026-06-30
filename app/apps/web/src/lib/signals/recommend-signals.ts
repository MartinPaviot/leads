/**
 * The signal RECOMMENDER (pillar 1) — "from your TAM/ICP, which signals should you
 * track?". Combines three inputs, none of which is new ML:
 *   1. catalog prior  — SIGNAL_CATALOG × SIGNAL_PRIORS (the curated B2B priors)
 *   2. TAM coverage   — detectActiveSignals over the tenant's companies: which
 *      signals actually FIRE in THIS book of accounts (vs a generic playbook)
 *   3. learned lift   — getSignalMultipliers(tenantId): per-tenant signal→outcome
 *      multipliers once ≥10 closed deals exist (priors until then; auto-upgrades)
 *
 * score = multiplier × (1 + COVERAGE_WEIGHT × coverage). Property signals carry
 * real coverage; monitor/event signals are scored as prospective (you'd set them
 * up to start collecting) so they still surface, ranked below well-covered ones.
 *
 * Pure ranking over data the platform already has — server-only for the DB reads.
 */
import { db } from "@/db";
import { companies, icps, icpCriteria } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { detectActiveSignals } from "@/lib/scoring/signal-detectors";
import { getSignalMultipliers, priorMultiplier } from "@/lib/scoring/signal-outcomes";
import { SIGNAL_CATALOG, appliesToIcp, type SignalDetectability } from "./signal-catalog";

const COVERAGE_WEIGHT = 2;
/** Monitor/event signals have no measured coverage; score them as if a modest
 * prospective coverage so they rank below proven property signals but still show. */
const PROSPECTIVE_PCT = 0.12;
const DEFAULT_SAMPLE_CAP = 5000;
/** Outcomes needed (tenant-wide) before we label a multiplier "learned". */
const LEARNED_THRESHOLD = 10;

export interface SignalRecommendation {
  type: string;
  label: string;
  rationale: string;
  detect: SignalDetectability;
  action: string;
  multiplier: number;
  multiplierSource: "learned" | "prior";
  /** Real coverage for property signals; null for monitor/event signals. */
  coverage: { count: number; total: number; pct: number } | null;
  score: number;
}

export interface RecommendSignalsResult {
  recommendations: SignalRecommendation[];
  totalAccounts: number;
  outcomesLearned: number;
  icpIndustries: string[];
}

/** Coarse seniority → persona-class map (for the catalog persona filter). */
function personasFromSeniorities(seniorities: string[]): string[] {
  const out = new Set<string>();
  for (const s of seniorities.map((x) => x.toLowerCase())) {
    if (/owner|founder|partner|c_suite|cxo|chief|c-level/.test(s)) { out.add("founder"); out.add("exec"); }
    else if (/vp|vice/.test(s)) out.add("vp");
    else if (/director|head|manager/.test(s)) out.add("manager");
    else out.add("ic");
  }
  return [...out];
}

/** Read the tenant's ACTIVE ICP industries + persona seniorities (best-effort,
 * for sector/persona skew + labeling). Empty arrays when no ICP is defined. */
async function readIcpContext(tenantId: string): Promise<{ industries: string[]; personas: string[] }> {
  const active = await db.select({ id: icps.id }).from(icps).where(and(eq(icps.tenantId, tenantId), eq(icps.status, "active")));
  if (active.length === 0) return { industries: [], personas: [] };
  const ids = active.map((a) => a.id);
  const crit = await db.select({ fieldKey: icpCriteria.fieldKey, value: icpCriteria.value }).from(icpCriteria).where(inArray(icpCriteria.icpId, ids));
  const flat = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)]);
  const industries: string[] = [];
  const seniorities: string[] = [];
  for (const c of crit) {
    if (c.fieldKey === "industry") industries.push(...flat(c.value));
    if (c.fieldKey === "person_seniorities") seniorities.push(...flat(c.value));
  }
  return { industries: [...new Set(industries)], personas: personasFromSeniorities(seniorities) };
}

/** Profile which signals actually fire across the tenant's companies. Returns the
 * per-type fired count + the number of accounts scanned. */
async function profileCoverage(tenantId: string, sampleCap: number): Promise<{ tally: Record<string, number>; total: number }> {
  const rows = await db.select({ properties: companies.properties }).from(companies).where(eq(companies.tenantId, tenantId)).limit(sampleCap);
  const tally: Record<string, number> = {};
  for (const r of rows) {
    const props = (r.properties as Record<string, unknown> | null) ?? {};
    for (const { type } of detectActiveSignals(props)) tally[type] = (tally[type] ?? 0) + 1;
  }
  return { tally, total: rows.length };
}

/**
 * Recommend the signals worth tracking for a tenant, ranked. Reads the active
 * ICP (sector/persona skew), profiles the TAM for real coverage, and weights by
 * the prior/learned multiplier.
 */
export async function recommendSignals(
  tenantId: string,
  opts: { limit?: number; sampleCap?: number } = {},
): Promise<RecommendSignalsResult> {
  const limit = Math.min(20, Math.max(1, opts.limit ?? 8));
  const sampleCap = Math.min(20000, Math.max(1, opts.sampleCap ?? DEFAULT_SAMPLE_CAP));

  const [{ multipliers, totalOutcomes }, icp, { tally, total }] = await Promise.all([
    getSignalMultipliers(tenantId),
    readIcpContext(tenantId),
    profileCoverage(tenantId, sampleCap),
  ]);
  const learned = totalOutcomes >= LEARNED_THRESHOLD;

  const recs: SignalRecommendation[] = [];
  for (const sig of SIGNAL_CATALOG) {
    if (!appliesToIcp(sig, icp.industries, icp.personas)) continue;
    const multiplier = multipliers[sig.type] ?? priorMultiplier(sig.type);
    const coverage =
      sig.detect === "property" ? { count: tally[sig.type] ?? 0, total, pct: total > 0 ? (tally[sig.type] ?? 0) / total : 0 } : null;
    // Real coverage when we actually measured some; otherwise (a 0-coverage cold
    // TAM, or a monitor/event signal) fall back to a prospective value so signals
    // rank by their B2B prior rather than being penalized for absent data.
    const covPct = coverage && coverage.pct > 0 ? coverage.pct : PROSPECTIVE_PCT;
    const score = multiplier * (1 + COVERAGE_WEIGHT * covPct);
    recs.push({
      type: sig.type,
      label: sig.label,
      rationale: sig.rationale,
      detect: sig.detect,
      action: sig.action,
      multiplier: Math.round(multiplier * 100) / 100,
      multiplierSource: learned ? "learned" : "prior",
      coverage,
      score: Math.round(score * 1000) / 1000,
    });
  }
  recs.sort((a, b) => b.score - a.score);
  return { recommendations: recs.slice(0, limit), totalAccounts: total, outcomesLearned: totalOutcomes, icpIndustries: icp.industries };
}
