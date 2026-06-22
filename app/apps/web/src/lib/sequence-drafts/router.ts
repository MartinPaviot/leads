/**
 * Pure-function helpers for the sequence-draft router (P0-1 task 1.4).
 *
 * Lives between `inngest/sequence-draft-router.ts` (DB IO + Inngest
 * step machinery) and the existing personalisation pipeline. Pure
 * functions mean we can test the routing decisions, the draft-row
 * construction, and the trigger-reason logic without spinning up
 * Postgres or Inngest's runtime.
 *
 * Tenant approval mode lives in `tenants.settings.approvalMode` for
 * now ("manual" | "auto", defaults to "manual"). Task 1.10 promotes
 * this to a dedicated column ; until then this helper reads the
 * jsonb-shaped settings.
 */

import { checkSpamSignals, type SpamWarning } from "@/lib/emails/email-spam-check";

export type ApprovalMode = "manual" | "auto";

/**
 * Read the tenant's approval mode from its settings jsonb.
 *
 * Defaults to `"manual"` — Monaco-parity stance is "the founder
 * approves every draft until they explicitly opt into auto". An
 * unset value should NOT silently autosend.
 */
export function decideRouteMode(
  settings: Record<string, unknown> | null | undefined,
): ApprovalMode {
  if (!settings || typeof settings !== "object") return "manual";
  const raw = (settings as Record<string, unknown>).approvalMode;
  if (raw === "auto") return "auto";
  if (raw === "manual") return "manual";
  return "manual";
}

/**
 * Build the row payload for `sequence_drafts` from the upstream
 * pipeline outputs. The caller (Inngest worker) calls this after
 * personalising and passes the resulting object straight into a
 * Drizzle `insert().values()`.
 *
 * Derives `triggerReason` from the step number + any signal hints
 * the cron passed alongside.
 */
export interface BuildDraftArgs {
  tenantId: string;
  sequenceId: string;
  stepId: string;
  enrollmentId: string;
  contactId: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  stepNumber: number;
  signalHint?: string | null;
  /** Citations from the personalisation step — each entry is an
   *  arbitrary object `{ kind, label, href, quote? }` shape. */
  personalizationSources?: Array<Record<string, unknown>>;
  /** P1-15 — data-backed quality score (0-1) graded at generation. */
  qualityScore?: number | null;
}

export interface DraftRowInsert {
  tenantId: string;
  sequenceId: string;
  stepId: string;
  enrollmentId: string;
  contactId: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  triggerReason: string;
  personalizationSources: Array<Record<string, unknown>>;
  // P0-4 — spam-trigger score computed at generation, surfaced in review.
  spamScore: number;
  spamSeverity: string;
  spamWarnings: SpamWarning[];
  // P1-15 — null when the grader couldn't score (fail-open).
  qualityScore: number | null;
  status: "pending_approval";
  version: 1;
}

export function buildDraftRow(args: BuildDraftArgs): DraftRowInsert {
  // P0-4 — score spam triggers at generation (pure) so the review UI can
  // colour-code the draft and the send gate has a precomputed signal.
  const spam = checkSpamSignals(args.subject, args.bodyText);
  return {
    tenantId: args.tenantId,
    sequenceId: args.sequenceId,
    stepId: args.stepId,
    enrollmentId: args.enrollmentId,
    contactId: args.contactId,
    subject: args.subject,
    bodyHtml: args.bodyHtml,
    bodyText: args.bodyText,
    triggerReason: deriveTriggerReason(args.stepNumber, args.signalHint),
    personalizationSources: args.personalizationSources ?? [],
    spamScore: spam.score,
    spamSeverity: spam.severity,
    spamWarnings: spam.warnings,
    qualityScore: args.qualityScore ?? null,
    status: "pending_approval",
    version: 1,
  };
}

function deriveTriggerReason(
  stepNumber: number,
  signalHint?: string | null,
): string {
  if (signalHint && signalHint.trim().length > 0) {
    return signalHint.trim().slice(0, 200);
  }
  if (stepNumber === 1) return "scheduled_step_1";
  return `scheduled_step_${stepNumber}`;
}

/**
 * After writing a draft, the enrollment must STOP advancing — the
 * approve route is the only path that bumps `currentStep`. We park
 * the enrollment by clearing `nextStepAt` so the cron's `<=`
 * predicate stops matching it. NULL > any-date is false in Postgres,
 * so the enrollment idles until either approve restores nextStepAt
 * or the user un-pauses manually.
 */
export const PARKED_NEXT_STEP_AT: Date | null = null;
