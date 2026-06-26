/**
 * Instantiate a proven template into live `sequences` + `sequence_steps` rows.
 *
 * This is what makes the router (#441) actually deliver the moat: it writes a
 * sequence whose `campaignConfig.triggerSignalTypes` matches the template's
 * trigger (via the canonical `writeTriggerConfig`), so `resolveSequenceForProspect`
 * lands that trigger's cohort on this cadence instead of the catch-all fallback.
 *
 * Defaults to status `"draft"` — seeding CONFIGURES the library without
 * activating sends (the router only routes to `active` sequences). The founder
 * activates when ready.
 *
 * Idempotent: the source template id is stamped into `campaignConfig.templateId`,
 * and `findExisting` dedupes on (tenant, templateId) so re-seeding never
 * duplicates. Pure — every DB write is injected, so it unit-tests without a DB.
 */

import { writeTriggerConfig } from "@/lib/sequences/triggers";
import type { ProvenSequenceTemplate } from "./types";

export type SeedStatus = "draft" | "active";

export interface SequenceInsert {
  tenantId: string;
  name: string;
  description: string;
  status: SeedStatus;
  /** triggerSignalTypes (router routing) + templateId/personaFit/angle (provenance). */
  campaignConfig: Record<string, unknown>;
  /** Owner. Null = pool/system-seeded (matches the import-unassigned convention). */
  createdBy: string | null;
}

export interface StepInsert {
  sequenceId: string;
  stepNumber: number;
  stepType: string;
  subjectTemplate: string;
  bodyTemplate: string;
  delayDays: number;
  channelConfig: Record<string, unknown>;
}

export interface InstantiateDeps {
  /** Return an existing seeded sequence for (tenant, templateId), or null. */
  findExisting: (tenantId: string, templateId: string) => Promise<{ id: string } | null>;
  /** Insert the sequence row; return its id. */
  insertSequence: (row: SequenceInsert) => Promise<{ id: string }>;
  /** Insert all step rows (one sequence's steps). */
  insertSteps: (rows: StepInsert[]) => Promise<void>;
}

export interface InstantiateOptions {
  status?: SeedStatus;
  createdBy?: string | null;
}

export interface InstantiateResult {
  templateId: string;
  outcome: "created" | "skipped_exists";
  sequenceId: string;
}

/** Build the `campaignConfig` jsonb for a seeded sequence (routing + provenance). */
export function buildCampaignConfig(template: ProvenSequenceTemplate): Record<string, unknown> {
  // writeTriggerConfig validates + dedupes the trigger array onto a fresh object.
  const base = writeTriggerConfig({}, template.triggerSignalTypes);
  return {
    ...base,
    templateId: template.id,
    personaFit: template.personaFit,
    recipientBenefitAngle: template.recipientBenefitAngle,
    sourceLang: template.lang,
  };
}

/** Instantiate one template for one tenant. Idempotent on (tenant, templateId). */
export async function instantiateTemplate(
  tenantId: string,
  template: ProvenSequenceTemplate,
  deps: InstantiateDeps,
  opts: InstantiateOptions = {},
): Promise<InstantiateResult> {
  const existing = await deps.findExisting(tenantId, template.id);
  if (existing) {
    return { templateId: template.id, outcome: "skipped_exists", sequenceId: existing.id };
  }

  const seq = await deps.insertSequence({
    tenantId,
    name: template.name,
    description: template.description,
    status: opts.status ?? "draft",
    campaignConfig: buildCampaignConfig(template),
    createdBy: opts.createdBy ?? null,
  });

  const steps: StepInsert[] = template.steps.map((s) => ({
    sequenceId: seq.id,
    stepNumber: s.stepNumber,
    stepType: s.stepType,
    subjectTemplate: s.subjectTemplate,
    bodyTemplate: s.bodyTemplate,
    delayDays: s.delayDays,
    channelConfig: s.channelConfig ?? {},
  }));
  await deps.insertSteps(steps);

  return { templateId: template.id, outcome: "created", sequenceId: seq.id };
}

/** Seed many templates for a tenant (sequential — preserves order, isolates failures). */
export async function instantiateTemplates(
  tenantId: string,
  templates: ProvenSequenceTemplate[],
  deps: InstantiateDeps,
  opts: InstantiateOptions = {},
): Promise<InstantiateResult[]> {
  const results: InstantiateResult[] = [];
  for (const t of templates) {
    results.push(await instantiateTemplate(tenantId, t, deps, opts));
  }
  return results;
}
