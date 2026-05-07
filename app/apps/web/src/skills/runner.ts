import { ZodError } from "zod";
import { traceAgent } from "@/lib/observability/observability";
import type { SkillDefinition, SkillRunOptions, SkillResult } from "./types";
import { getSkillQualityConfig, type SkillQualityConfig } from "./skill-quality-config";
import logger from "@/lib/observability/logger";

// ─── Skill Runner ───────────────────────────────────────────

export async function runSkill<TInput, TOutput>(
  skill: SkillDefinition<TInput, TOutput>,
  rawInput: unknown,
  options: SkillRunOptions,
): Promise<SkillResult<TOutput>> {
  const start = Date.now();

  // 1. Validate input
  let input: TInput;
  try {
    input = skill.inputSchema.parse(rawInput);
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        success: false,
        error: `Validation error: ${err.issues.map((e: { path: PropertyKey[]; message: string }) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        dryRun: options.dryRun,
        durationMs: Date.now() - start,
      };
    }
    throw err;
  }

  // 2. Dry-run mode — validate only, no execution
  if (options.dryRun) {
    return {
      success: true,
      dryRun: true,
      durationMs: Date.now() - start,
    };
  }

  // 3. Execute with tracing
  try {
    const traceCtx = options.traceContext ?? {
      agentId: `skill-${skill.slug}`,
      tenantId: options.tenantId,
    };

    const data = await traceAgent(traceCtx, async (span) => {
      span.setInput(JSON.stringify(input).slice(0, 2000));
      const result = await skill.handler(input, options);
      span.setOutput(JSON.stringify(result).slice(0, 2000));
      return result;
    });

    // 4. Quality gate — check output before returning to caller
    const qualityConfig = getSkillQualityConfig(skill.slug);
    const qualityResult = gradeSkillOutput(data, qualityConfig);

    if (qualityResult.score < qualityConfig.minQualityScore) {
      logger.warn(`Skill ${skill.slug} output below threshold: ${qualityResult.score.toFixed(2)} < ${qualityConfig.minQualityScore}`, {
        issues: qualityResult.issues,
      });
      return {
        success: true,
        data,
        degraded: true,
        degradationReason: qualityResult.degradationReason,
        qualityScore: qualityResult.score,
        userSuggestion: qualityResult.suggestion,
        dryRun: false,
        durationMs: Date.now() - start,
      };
    }

    return {
      success: true,
      data,
      qualityScore: qualityResult.score,
      dryRun: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`Skill ${skill.slug} failed`, { error: errorMessage });
    return {
      success: false,
      error: errorMessage,
      dryRun: false,
      durationMs: Date.now() - start,
    };
  }
}

// ─── Quality Grading ────────────────────────────────────────

interface QualityGradeResult {
  score: number;
  issues: string[];
  degradationReason: "insufficient_context" | "below_quality_threshold" | "missing_required_data";
  suggestion: string;
}

function gradeSkillOutput(data: unknown, config: SkillQualityConfig): QualityGradeResult {
  if (config.graderType === "none") {
    return { score: 1.0, issues: [], degradationReason: "below_quality_threshold", suggestion: "" };
  }

  if (config.graderType === "email") {
    return gradeEmailOutput(data);
  }

  if (config.graderType === "field_completeness") {
    return gradeFieldCompleteness(data, config.requiredFields || []);
  }

  if (config.graderType === "data_completeness") {
    return gradeDataCompleteness(data);
  }

  if (config.graderType === "signal_relevance") {
    return gradeSignalRelevance(data);
  }

  return { score: 1.0, issues: [], degradationReason: "below_quality_threshold", suggestion: "" };
}

function gradeEmailOutput(data: unknown): QualityGradeResult {
  const issues: string[] = [];
  let score = 1.0;

  const str = typeof data === "string" ? data : JSON.stringify(data || "");
  const lower = str.toLowerCase();

  const deadOpeners = [
    "i hope this finds you well", "i noticed that", "just wanted to",
    "i'd love to", "i'm reaching out because",
  ];
  for (const opener of deadOpeners) {
    if (lower.includes(opener)) {
      score -= 0.15;
      issues.push(`Dead opener: "${opener}"`);
    }
  }

  const wordCount = str.split(/\s+/).filter(Boolean).length;
  if (wordCount > 200) {
    score -= 0.2;
    issues.push(`${wordCount} words (too long for cold outreach)`);
  }

  if (str.includes("{{") || str.includes("[COMPANY]") || lower.includes("undefined")) {
    score -= 0.3;
    issues.push("Contains unresolved placeholders");
  }

  if (score < 0.8) {
    return {
      score: Math.max(0, score),
      issues,
      degradationReason: "below_quality_threshold",
      suggestion: "The generated email contains quality issues. Please review before sending or provide more context about the prospect.",
    };
  }

  return { score: Math.max(0, score), issues, degradationReason: "below_quality_threshold", suggestion: "" };
}

function gradeFieldCompleteness(data: unknown, requiredFields: string[]): QualityGradeResult {
  if (!data || typeof data !== "object") {
    return {
      score: 0,
      issues: ["Output is not an object"],
      degradationReason: "missing_required_data",
      suggestion: "The system could not generate a complete response. Try providing more context about the deal or company.",
    };
  }

  const obj = data as Record<string, unknown>;
  const missing: string[] = [];

  for (const field of requiredFields) {
    const value = obj[field];
    const isEmpty = value === undefined || value === null || value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (isEmpty) missing.push(field);
  }

  const score = requiredFields.length > 0
    ? (requiredFields.length - missing.length) / requiredFields.length
    : 1.0;

  if (missing.length > 0) {
    return {
      score,
      issues: missing.map((f) => `Missing required field: ${f}`),
      degradationReason: "insufficient_context",
      suggestion: `The response is incomplete — missing: ${missing.join(", ")}. Provide more data about the prospect or deal to get a complete analysis.`,
    };
  }

  return { score, issues: [], degradationReason: "insufficient_context", suggestion: "" };
}

function gradeDataCompleteness(data: unknown): QualityGradeResult {
  if (!data || typeof data !== "object") {
    return {
      score: 0,
      issues: ["No data returned"],
      degradationReason: "missing_required_data",
      suggestion: "No results found. Check that the input data (company IDs, contact IDs) exists in the system.",
    };
  }

  const obj = data as Record<string, unknown>;
  const fields = Object.keys(obj);
  if (fields.length === 0) {
    return {
      score: 0,
      issues: ["Empty result object"],
      degradationReason: "missing_required_data",
      suggestion: "The enrichment returned no data. The external data source may not have coverage for this entity.",
    };
  }

  const nonNull = fields.filter((k) => {
    const v = obj[k];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });
  const score = nonNull.length / fields.length;

  if (score < 0.6) {
    return {
      score,
      issues: [`Only ${nonNull.length}/${fields.length} fields populated`],
      degradationReason: "insufficient_context",
      suggestion: "Limited data available for this entity. Results may be incomplete.",
    };
  }

  return { score, issues: [], degradationReason: "insufficient_context", suggestion: "" };
}

function gradeSignalRelevance(data: unknown): QualityGradeResult {
  if (!data || typeof data !== "object") {
    return {
      score: 0,
      issues: ["No signals returned"],
      degradationReason: "missing_required_data",
      suggestion: "No buying signals detected. This may mean the companies are not currently active in market.",
    };
  }

  const obj = data as Record<string, unknown>;
  const signals = Array.isArray(obj.signals) ? obj.signals : [];

  if (signals.length === 0) {
    return {
      score: 0.3,
      issues: ["Zero signals found"],
      degradationReason: "insufficient_context",
      suggestion: "No signals detected for the specified companies. Consider broadening the signal types or checking more companies.",
    };
  }

  const highRelevance = signals.filter((s: any) => s?.relevance === "high" || s?.strength === "high").length;
  const score = Math.min(1.0, 0.5 + (highRelevance / signals.length) * 0.5);

  return { score, issues: [], degradationReason: "insufficient_context", suggestion: "" };
}
