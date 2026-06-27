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
import { templateChannels } from "./types";
import type { ProvenSequenceTemplate, TemplateStepType, PersonaClass } from "./types";

export { PROVEN_TEMPLATES } from "./catalog";
export * from "./types";

/** Interpolation vars the live send path substitutes (`inngest/functions.ts:630-635`). */
export const SUPPORTED_TEMPLATE_VARS = ["firstName", "lastName", "fullName", "title"] as const;

/** One step, trimmed for the gallery preview (no full body — keep the payload light). */
export interface TemplateStepSummary {
  stepNumber: number;
  stepType: TemplateStepType;
  delayDays: number;
  subjectTemplate: string;
  valueAdded: string;
}

/** A template as the in-product gallery consumes it (metadata + cadence shape, no full bodies). */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  triggerSignalTypes: KnownSignalType[];
  personaFit: PersonaClass[];
  recipientBenefitAngle: string;
  lang: "fr" | "en";
  channels: TemplateStepType[];
  stepCount: number;
  /** Total cadence span in days (sum of step delays). */
  cadenceDays: number;
  steps: TemplateStepSummary[];
}

/** Map a full template to the gallery summary (pure → testable; route adds `instantiated`). */
export function toTemplateSummary(t: ProvenSequenceTemplate): TemplateSummary {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    triggerSignalTypes: t.triggerSignalTypes,
    personaFit: t.personaFit,
    recipientBenefitAngle: t.recipientBenefitAngle,
    lang: t.lang,
    channels: templateChannels(t),
    stepCount: t.steps.length,
    cadenceDays: t.steps.reduce((sum, s) => sum + s.delayDays, 0),
    steps: t.steps.map((s) => ({
      stepNumber: s.stepNumber,
      stepType: s.stepType,
      delayDays: s.delayDays,
      subjectTemplate: s.subjectTemplate,
      valueAdded: s.valueAdded,
    })),
  };
}

/** Read the seeding provenance id off a sequence's campaignConfig (null if not template-seeded). */
export function templateIdOf(campaignConfig: Record<string, unknown> | null | undefined): string | null {
  if (!campaignConfig || typeof campaignConfig !== "object") return null;
  const id = (campaignConfig as Record<string, unknown>).templateId;
  return typeof id === "string" ? id : null;
}

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

// Match ANY `{{...}}` occurrence, then require the inner text to be EXACTLY a
// supported var. The send path builds `new RegExp(\`\\{\\{${key}\\}\\}\`)` with
// no whitespace tolerance (inngest/functions.ts), so `{{ firstName }}` or
// `{{first_name}}` would pass a loose check yet ship literally to the prospect.
const VAR_PATTERN = /\{\{([^}]*)\}\}/g;
/** Copy AI-slop tokens banned everywhere (mirrors lib/copy ALWAYS_BANNED). */
const BANNED_COPY_TOKENS = ["—", "–", "--"];

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

    // Banned AI-slop tokens (em-dashes) in ANY shipped/displayed copy — the
    // template floor ships unguarded on the LLM-fallback path, so the catalog
    // itself must be clean (the live copy engine bans these tokens).
    const copyStrings = [
      t.name,
      t.description,
      t.recipientBenefitAngle,
      ...t.steps.flatMap((s) => [s.subjectTemplate, s.bodyTemplate, s.valueAdded, JSON.stringify(s.channelConfig ?? {})]),
    ];
    for (const tok of BANNED_COPY_TOKENS) {
      if (copyStrings.some((str) => str.includes(tok))) {
        issues.push({ templateId: t.id, problem: `contains banned copy token "${tok}" (AI-slop; use a colon/comma)` });
      }
    }

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
            issues.push({
              templateId: t.id,
              problem: `step ${s.stepNumber} uses an unsupported/malformed var {{${m[1]}}} (must be exactly one of ${SUPPORTED_TEMPLATE_VARS.join("/")}, no spaces)`,
            });
          }
        }
      }
    });
  }
  return issues;
}
