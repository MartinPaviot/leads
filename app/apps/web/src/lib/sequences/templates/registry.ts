/**
 * Proven sequence-template registry — lookups + a catalog self-check.
 *
 * The catalog is the single source of truth for "what trigger-specific cadence
 * can the autopilot router land a cohort on". These helpers index it by id and
 * by trigger, and `validateCatalog` asserts the invariants the router + send
 * path rely on (unique ids, every signal type covered, ordered steps, supported
 * interpolation vars) — run as a test so a malformed template can't ship.
 */

import { KNOWN_SIGNAL_TYPES, type KnownSignalType } from "@/lib/sequences/triggers";
import { PROVEN_TEMPLATES } from "./catalog";
import type { ProvenSequenceTemplate } from "./types";

export { PROVEN_TEMPLATES } from "./catalog";
export * from "./types";

/** Interpolation vars the live send path substitutes (`inngest/functions.ts:630-635`). */
export const SUPPORTED_TEMPLATE_VARS = ["firstName", "lastName", "fullName", "title"] as const;

/** Look up a template by its stable id. */
export function getTemplate(id: string): ProvenSequenceTemplate | null {
  return PROVEN_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** All templates that a signal of this type would route to (trigger match). */
export function templatesForTrigger(signalType: KnownSignalType): ProvenSequenceTemplate[] {
  return PROVEN_TEMPLATES.filter((t) => t.triggerSignalTypes.includes(signalType));
}

/** Signal types with NO proven template (router would fall back for these). */
export function uncoveredSignalTypes(): KnownSignalType[] {
  return KNOWN_SIGNAL_TYPES.filter((s) => templatesForTrigger(s).length === 0);
}

export interface CatalogIssue {
  templateId: string;
  problem: string;
}

const VAR_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * Assert the catalog invariants. Returns [] when healthy, else one issue per
 * problem. Pure — drives a unit test (and could gate CI).
 */
export function validateCatalog(templates: ProvenSequenceTemplate[] = PROVEN_TEMPLATES): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const seenIds = new Set<string>();
  const supported = new Set<string>(SUPPORTED_TEMPLATE_VARS);

  for (const t of templates) {
    if (seenIds.has(t.id)) issues.push({ templateId: t.id, problem: "duplicate template id" });
    seenIds.add(t.id);

    if (t.triggerSignalTypes.length === 0) {
      issues.push({ templateId: t.id, problem: "no triggerSignalTypes → would match ALL signals (not trigger-specific)" });
    }
    if (t.steps.length === 0) {
      issues.push({ templateId: t.id, problem: "no steps" });
    }
    // Steps must be 1..N in order so cadence delays compose predictably.
    t.steps.forEach((s, i) => {
      if (s.stepNumber !== i + 1) {
        issues.push({ templateId: t.id, problem: `step ${i} has stepNumber ${s.stepNumber}, expected ${i + 1}` });
      }
      if (s.delayDays < 0) issues.push({ templateId: t.id, problem: `step ${s.stepNumber} has negative delayDays` });
      if (s.stepType === "email" && !s.subjectTemplate.trim()) {
        issues.push({ templateId: t.id, problem: `email step ${s.stepNumber} has an empty subject` });
      }
      if (!s.bodyTemplate.trim()) {
        issues.push({ templateId: t.id, problem: `step ${s.stepNumber} has an empty body` });
      }
      if (!s.valueAdded.trim()) {
        issues.push({ templateId: t.id, problem: `step ${s.stepNumber} declares no valueAdded` });
      }
      // Every interpolation var must be one the send path actually substitutes,
      // else it ships as a literal `{{foo}}` to the prospect.
      for (const field of [s.subjectTemplate, s.bodyTemplate]) {
        for (const m of field.matchAll(VAR_PATTERN)) {
          if (!supported.has(m[1])) {
            issues.push({ templateId: t.id, problem: `step ${s.stepNumber} uses unsupported var {{${m[1]}}}` });
          }
        }
      }
    });
  }
  return issues;
}
