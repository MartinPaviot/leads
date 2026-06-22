/**
 * Spec 20 — variant generation along exactly one declared axis (AC1), with QC
 * run and send-eligibility computed per variant. Generation is agentic (the
 * spec-19 grounded generator, injected); QC + eligibility are deterministic.
 *
 * Each variant in a set shares everything except the declared axis value, so an
 * A/B result is attributable to that axis. Every variant carries its prompt
 * context + evidence for audit/reproducibility (AC4).
 */

import { runQc, sendEligible, type QcInput, type QcOptions, type ApprovalState, type QcResult, type PersonalizationLevel } from "./qc";

export type VariantAxis = "angle" | "subject" | "cta";

/** What the injected spec-19 generator returns for one axis value. */
export interface VariantDraft {
  body: string;
  subject?: string;
  evidence: { id: string }[];
  personalization_level: PersonalizationLevel;
  /** The prompt context that produced it (AC4 audit). */
  promptContext?: Record<string, unknown>;
}

export interface Variant extends QcInput {
  id: string;
  slot: string;
  axis: VariantAxis;
  axisValue: string;
  subject?: string;
  promptContext: Record<string, unknown>;
  qc: QcResult;
  sendEligible: boolean;
}

export interface VariantSetSpec {
  slot: string;
  /** The single axis this set varies (AC1). */
  axis: VariantAxis;
  /** One value per variant — n = axisValues.length. */
  axisValues: string[];
}

export interface GenerateVariantsDeps {
  /** spec-19 grounded generator: produces a base message for one axis value. */
  generate: (axisValue: string, index: number) => Promise<VariantDraft>;
  newId: () => string;
  qc?: QcOptions;
  /** spec-03 approval gate state for this campaign. */
  approval: ApprovalState;
}

/**
 * Generate one variant per declared axis value, run QC, compute send-eligibility.
 * A draft that throws is skipped (null filtered out) rather than aborting the set.
 */
export async function generateVariants(spec: VariantSetSpec, deps: GenerateVariantsDeps): Promise<Variant[]> {
  const out: Variant[] = [];
  for (let i = 0; i < spec.axisValues.length; i++) {
    const axisValue = spec.axisValues[i];
    let draft: VariantDraft;
    try {
      draft = await deps.generate(axisValue, i);
    } catch {
      continue; // a failed generation drops that variant, not the whole set
    }
    const qcInput: QcInput = {
      body: draft.body,
      subject: draft.subject,
      evidence: draft.evidence,
      personalization_level: draft.personalization_level,
    };
    const qc = runQc(qcInput, deps.qc);
    out.push({
      ...qcInput,
      id: deps.newId(),
      slot: spec.slot,
      axis: spec.axis,
      axisValue,
      promptContext: { axis: spec.axis, axisValue, ...(draft.promptContext ?? {}) },
      qc,
      sendEligible: sendEligible(qc, deps.approval),
    });
  }
  return out;
}
