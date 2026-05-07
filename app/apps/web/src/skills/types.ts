import { z } from "zod";
import type { TraceContext } from "@/lib/observability/observability";

// ─── Skill Categories ───────────────────────────────────────

export type SkillCategory =
  | "enrichment"
  | "scoring"
  | "outreach"
  | "signals"
  | "intelligence";

// ─── Skill Run Options ──────────────────────────────────────

export interface SkillRunOptions {
  tenantId: string;
  dryRun: boolean;
  traceContext?: TraceContext;
}

// ─── Skill Definition ───────────────────────────────────────

export interface SkillDefinition<TInput = unknown, TOutput = unknown> {
  slug: string;
  name: string;
  category: SkillCategory;
  description: string;
  costEstimate: string;
  inputSchema: z.ZodSchema<TInput>;
  outputSchema: z.ZodSchema<TOutput>;
  /**
   * Method form (not arrow) so TS treats the parameter position as
   * bivariant. Each skill's handler is typed against its own concrete
   * input shape (parsed from `inputSchema`); the runner always calls it
   * AFTER `inputSchema.parse(rawInput)`, so the narrow handler type is
   * sound at runtime even though the registry stores skills with
   * `TInput = unknown`.
   */
  handler(input: TInput, options: SkillRunOptions): Promise<TOutput>;
}

// ─── Skill Result ───────────────────────────────────────────

export interface SkillResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  dryRun: boolean;
  costIncurred?: number;
  durationMs: number;
  traceId?: string;
  degraded?: boolean;
  degradationReason?: "insufficient_context" | "below_quality_threshold" | "missing_required_data";
  qualityScore?: number;
  userSuggestion?: string;
}
