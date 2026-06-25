/**
 * Spec 37 (B4.1) — enroll ONE selected prospect, auto or draft. REUSES the existing
 * enrollment primitives (no new enrollment logic):
 *  - auto  → guardEnrollment (anti-collision claim) then the SAME sequenceEnrollments
 *            insert signal-to-sequence does (status active, step 1, due now).
 *  - draft → recordAgentAction (the "Needs you" approval lane), exactly like
 *            signal-to-sequence's defer path, so review/batch tenants get a pending
 *            enrollment to approve instead of an auto-send.
 *
 * The action ("auto"|"draft") is decided upstream by decideAutopilotEnrollment (B2.2)
 * from the tenant's approval mode. Eligibility/suppression/already-enrolled were
 * applied at SELECTION (B3.1) and are re-checked at transport by evaluateSend; this
 * function only performs the enroll/defer. Deps injected for unit-testability.
 *
 * Blast radius: lib/autopilot/* only.
 */

import { db as defaultDb } from "@/db";
import { sequenceEnrollments } from "@/db/schema";
import { guardEnrollment } from "@/lib/anti-collision/enroll-guard";
import { recordAgentAction } from "@/lib/agents/agent-actions";
import type { AutopilotEnrollAction } from "./enroll-decision";

export type EnrollOutcome = "enrolled" | "drafted" | "collision";

export interface EnrollOneInput {
  tenantId: string;
  contactId: string;
  sequenceId: string;
  /** "auto" → enroll now; "draft" → queue for review (from decideAutopilotEnrollment). */
  action: AutopilotEnrollAction;
  /** Extra context for the draft record (companyId, copy preview, …). */
  draftPayload?: Record<string, unknown>;
}

export interface EnrollOneDeps {
  guard?: typeof guardEnrollment;
  recordDraft?: typeof recordAgentAction;
  database?: typeof defaultDb;
}

/** Enroll or draft one prospect. Never throws on a normal disposition; returns the outcome. */
export async function enrollOne(input: EnrollOneInput, deps: EnrollOneDeps = {}): Promise<{ outcome: EnrollOutcome }> {
  const guard = deps.guard ?? guardEnrollment;
  const recordDraft = deps.recordDraft ?? recordAgentAction;
  const database = deps.database ?? defaultDb;

  if (input.action === "draft") {
    await recordDraft({
      tenantId: input.tenantId,
      actionType: "sequence-enrollment",
      awaitingApproval: true,
      payload: { source: "autopilot", sequenceId: input.sequenceId, contactIds: [input.contactId], ...input.draftPayload },
    });
    return { outcome: "drafted" };
  }

  // auto — anti-collision claim first; a held contact is skipped (never double-enrolled).
  const ac = await guard({ tenantId: input.tenantId, contactId: input.contactId, enrollmentId: `${input.sequenceId}:${input.contactId}` });
  if (!ac.proceed) return { outcome: "collision" };

  await database.insert(sequenceEnrollments).values({
    sequenceId: input.sequenceId,
    contactId: input.contactId,
    status: "active",
    currentStep: 1,
    nextStepAt: new Date(), // first step due immediately; the send crons pick it up under evaluateSend
  });
  return { outcome: "enrolled" };
}
