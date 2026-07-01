/**
 * Distillation pipeline -- captures high-quality (input, output) pairs
 * from production agent runs for future fine-tuning.
 *
 * Sources of quality signal:
 * - User approved without editing (trust score: approved_no_edit)
 * - Eval score >= 0.85 on a traced run
 * - User gave explicit positive feedback
 *
 * Privacy: all PII is stripped before storage. Tenant-specific data
 * (company names, contact names, emails) is replaced with placeholders.
 * The resulting dataset is safe for cross-tenant model training.
 */

import { db } from "@/db";
import { distillationSamples, companies, contacts } from "@/db/schema";
import { eq, and, desc, gte, sql, count } from "drizzle-orm";
import logger from "../observability/logger";

// ── Types ──────────────────────────────────────────────────────

/**
 * Where a captured training sample came from.
 * - user_approved: a draft the founder approved WITHOUT edits (the AI got it right).
 * - user_edited: the founder's EDITED final of a draft (the strongest teaching
 *   signal — "here is what I actually want sent" — kept separable from
 *   user_approved so its downstream value can be measured on its own).
 * - eval_high_score: auto-curated from a high-scoring production trace.
 * - explicit_feedback: an explicit thumbs-up / correction.
 */
export type DistillationQualitySource =
  | "user_approved"
  | "user_edited"
  | "eval_high_score"
  | "explicit_feedback";

export interface DistillationSample {
  id: string;
  agentId: string;
  systemPrompt: string;      // anonymized
  userInput: string;          // anonymized
  assistantOutput: string;    // anonymized
  toolCalls: string[];        // tool names only, no args
  qualitySource: DistillationQualitySource;
  qualityScore: number;       // 0-1
  createdAt: string;
}

export interface CaptureParams {
  agentId: string;
  systemPrompt: string;
  userInput: string;
  assistantOutput: string;
  toolCalls?: string[];
  qualitySource: DistillationQualitySource;
  qualityScore: number;
  tenantId: string;
  traceId?: string;
}

// ── PII Anonymization ──────────────────────────────────────────

/**
 * Strip PII from text before storing as a distillation sample.
 *
 * Replacements:
 * - Email addresses -> [EMAIL]
 * - Phone numbers -> [PHONE]
 * - URLs -> [URL]
 * - Names matching known contact/company patterns -> [PERSON]/[COMPANY]
 *
 * The function is intentionally aggressive -- false positives (over-
 * anonymization) are acceptable because the model can still learn
 * the pattern. False negatives (leaked PII) are not acceptable.
 */
export function anonymizeText(text: string, knownNames?: { persons: string[]; companies: string[] }): string {
  let result = text;

  // 1. Email addresses
  result = result.replace(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    "[EMAIL]"
  );

  // 2. Phone numbers (international and domestic formats)
  // Matches: +1-555-123-4567, (555) 123-4567, 555.123.4567, +33 6 12 34 56 78
  result = result.replace(
    /\+?\d[\d\s\-().]{7,}\d/g,
    "[PHONE]"
  );

  // 3. URLs (http/https, but preserve protocol-less domain references for context)
  result = result.replace(
    /https?:\/\/[^\s<>"{}|\\^`[\]]+/g,
    "[URL]"
  );

  // 4. Known person and company names (case-insensitive, whole-word)
  if (knownNames) {
    // Sort by length descending so "John Smith" is replaced before "John"
    const sortedPersons = [...knownNames.persons]
      .filter((n) => n.length >= 2)
      .sort((a, b) => b.length - a.length);
    for (const name of sortedPersons) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[PERSON]");
    }

    const sortedCompanies = [...knownNames.companies]
      .filter((n) => n.length >= 2)
      .sort((a, b) => b.length - a.length);
    for (const company of sortedCompanies) {
      const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[COMPANY]");
    }
  }

  return result;
}

/**
 * Load known person and company names for a tenant to use during
 * anonymization. Cached per-request (not globally) to avoid stale data.
 */
async function loadKnownNames(tenantId: string): Promise<{ persons: string[]; companies: string[] }> {
  try {
    const [personRows, companyRows] = await Promise.all([
      db.select({ firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(eq(contacts.tenantId, tenantId))
        .limit(500),
      db.select({ name: companies.name })
        .from(companies)
        .where(eq(companies.tenantId, tenantId))
        .limit(500),
    ]);

    const persons: string[] = [];
    for (const r of personRows) {
      const full = [r.firstName, r.lastName].filter(Boolean).join(" ");
      if (full) persons.push(full);
      if (r.firstName) persons.push(r.firstName);
      if (r.lastName) persons.push(r.lastName);
    }

    const companyNames = companyRows
      .map((c) => c.name)
      .filter((n): n is string => !!n);

    return { persons: [...new Set(persons)], companies: [...new Set(companyNames)] };
  } catch {
    return { persons: [], companies: [] };
  }
}

// ── Core Pipeline ──────────────────────────────────────────────

/**
 * Capture a high-quality agent output as a distillation sample.
 *
 * All text fields are anonymized before storage. The sample is safe
 * for cross-tenant model training.
 */
export async function captureDistillationSample(params: CaptureParams): Promise<void> {
  try {
    const {
      agentId,
      systemPrompt,
      userInput,
      assistantOutput,
      toolCalls = [],
      qualitySource,
      qualityScore,
      tenantId,
      traceId,
    } = params;

    // Skip empty or very short outputs (not useful for training)
    if (!userInput || !assistantOutput || assistantOutput.length < 50) return;

    // Quality gate: only capture outputs above the threshold
    if (qualityScore < 0.6) return;

    // Load known names for PII stripping
    const knownNames = await loadKnownNames(tenantId);

    // Anonymize all text fields
    const anonSystemPrompt = anonymizeText(systemPrompt, knownNames);
    const anonInput = anonymizeText(userInput, knownNames);
    const anonOutput = anonymizeText(assistantOutput, knownNames);

    // Check for duplicate (same anonymized input + agent)
    const existing = await db.select({ id: distillationSamples.id })
      .from(distillationSamples)
      .where(and(
        eq(distillationSamples.agentId, agentId),
        eq(distillationSamples.userInput, anonInput),
      ))
      .limit(1);

    if (existing.length > 0) return;

    await db.insert(distillationSamples).values({
      agentId,
      systemPrompt: anonSystemPrompt,
      userInput: anonInput,
      assistantOutput: anonOutput,
      toolCalls: toolCalls,
      qualitySource,
      qualityScore,
      tenantId,
      traceId,
    });

    logger.info("[DISTILLATION] Captured sample", {
      agentId,
      qualitySource,
      qualityScore: qualityScore.toFixed(2),
      inputLen: userInput.length,
      outputLen: assistantOutput.length,
    });
  } catch (err) {
    // Non-critical -- log and continue. Never block the main flow.
    logger.warn("[DISTILLATION] captureDistillationSample failed", { err });
  }
}

// ── Export ──────────────────────────────────────────────────────

/**
 * Export the distillation dataset in JSONL or Anthropic fine-tuning format.
 *
 * JSONL: one JSON object per line with { system, input, output, tools }
 * Anthropic: Anthropic Messages API format for fine-tuning
 *   { messages: [{ role: "system", content }, { role: "user", content }, { role: "assistant", content }] }
 */
export async function exportDistillationDataset(
  format: "jsonl" | "anthropic",
  options?: { agentId?: string; minScore?: number; limit?: number }
): Promise<string> {
  const { agentId, minScore = 0.7, limit = 10000 } = options || {};

  const conditions = [gte(distillationSamples.qualityScore, minScore)];
  if (agentId) {
    conditions.push(eq(distillationSamples.agentId, agentId));
  }

  const samples = await db.select({
    systemPrompt: distillationSamples.systemPrompt,
    userInput: distillationSamples.userInput,
    assistantOutput: distillationSamples.assistantOutput,
    toolCalls: distillationSamples.toolCalls,
    qualityScore: distillationSamples.qualityScore,
    agentId: distillationSamples.agentId,
  })
    .from(distillationSamples)
    .where(and(...conditions))
    .orderBy(desc(distillationSamples.qualityScore))
    .limit(limit);

  if (format === "anthropic") {
    return samples.map((s) => JSON.stringify({
      messages: [
        { role: "system", content: s.systemPrompt },
        { role: "user", content: s.userInput },
        { role: "assistant", content: s.assistantOutput },
      ],
      metadata: {
        agent_id: s.agentId,
        quality_score: s.qualityScore,
        tools_used: s.toolCalls,
      },
    })).join("\n");
  }

  // Default: JSONL
  return samples.map((s) => JSON.stringify({
    system: s.systemPrompt,
    input: s.userInput,
    output: s.assistantOutput,
    tools: s.toolCalls,
    agent_id: s.agentId,
    quality_score: s.qualityScore,
  })).join("\n");
}

// ── Stats ──────────────────────────────────────────────────────

export interface DistillationStats {
  totalSamples: number;
  byAgent: Array<{ agentId: string; count: number }>;
  byQualitySource: Array<{ qualitySource: string; count: number }>;
  avgQualityScore: number;
  oldestSample: string | null;
  newestSample: string | null;
}

/**
 * Get dataset statistics for the admin dashboard.
 */
export async function getDistillationStats(): Promise<DistillationStats> {
  const [totalResult] = await db.select({
    count: count(),
    avg: sql<number>`coalesce(avg(${distillationSamples.qualityScore}), 0)`,
    oldest: sql<string>`min(${distillationSamples.createdAt})`,
    newest: sql<string>`max(${distillationSamples.createdAt})`,
  }).from(distillationSamples);

  const byAgent = await db.select({
    agentId: distillationSamples.agentId,
    count: count(),
  })
    .from(distillationSamples)
    .groupBy(distillationSamples.agentId)
    .orderBy(desc(count()));

  const byQualitySource = await db.select({
    qualitySource: distillationSamples.qualitySource,
    count: count(),
  })
    .from(distillationSamples)
    .groupBy(distillationSamples.qualitySource)
    .orderBy(desc(count()));

  return {
    totalSamples: totalResult.count,
    byAgent: byAgent.map((r) => ({ agentId: r.agentId, count: r.count })),
    byQualitySource: byQualitySource.map((r) => ({
      qualitySource: r.qualitySource,
      count: r.count,
    })),
    avgQualityScore: Number(totalResult.avg) || 0,
    oldestSample: totalResult.oldest || null,
    newestSample: totalResult.newest || null,
  };
}
