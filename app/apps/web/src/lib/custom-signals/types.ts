import type { Source } from "@/lib/tam-stream/events";

/**
 * Serialized detection plan stored in `custom_signals.plan`.
 *
 * The detector tries each tier in order and stops on the first
 * resolution:
 *
 *   1. `keywords`  — case-insensitive substring match against the
 *                    company's description/keywords/technologies.
 *                    Resolves `true` with confidence `high` on hit.
 *   2. `urlPatterns` — HEAD-check against `https://{domain}/{pattern}`
 *                    for each pattern. Any 2xx resolves `true` with
 *                    confidence `high` and the URL as source.
 *   3. `judgePrompt` — free-form LLM judge. Resolves with whatever
 *                    the model says. Confidence is always `medium`
 *                    because it's an inference over partial data.
 *
 * The generator that builds this plan may leave any field empty;
 * the detector treats empty arrays / blank prompt as "skip this
 * tier". A plan with everything empty always resolves
 * `{ value: false, confidence: indeterminate }` — the UI still
 * renders the chip, just muted.
 */
export interface CustomSignalPlan {
  judgePrompt: string;
  keywords: string[];
  urlPatterns: string[];
}

/** Shape persisted in `companies.properties.customSignals[signalId]`. */
export interface CustomSignalResult {
  value: boolean;
  reason: string;
  sources: Source[];
  confidence: "high" | "medium" | "indeterminate";
  computedAt: string;
}

/** Minimal subset of the DB row the detector needs. */
export interface CustomSignalDefinition {
  id: string;
  name: string;
  description: string;
  plan: CustomSignalPlan;
}
