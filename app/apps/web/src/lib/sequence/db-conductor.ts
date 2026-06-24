/**
 * Spec 25 — DB conductor: runs the pure sequence engine (./engine) against the
 * LIVE schema, behind the `SEQUENCE_ENGINE_V2` flag.
 *
 * SAFE CUTOVER: the old runtime (inngest/functions.ts `sendSequenceStep`) stays
 * primary; this opt-in path only runs when the flag is on. The engine's ports
 * are wired to the EXISTING primitives — NOT to the reserved spec-23 send port:
 *   - isEligible  -> spec-17 (contact.email_status)
 *   - isSuppressed-> spec-22 (suppression) + email_optouts
 *   - releaseLock -> spec-14 (releaseEnrollment)
 *   - pullVariant -> sequence_steps template + spec-19 LLM personalization, with
 *                    legacy-parity fallback tagging, AND the spec-19/20 grounded
 *                    copy cutover (primary when high) behind COPY_ENGINE_PRIMARY
 *   - sendEmail   -> enqueueOutbound (CLE-11 undo window) + trackPipeline + a
 *                    sequence_step_sent activity (legacy-parity side-effects)
 *   - isGuardTripped -> spec-27 deliverability guard
 *
 * BEST-OF-BOTH: V2's gating (17 eligibility / 22 suppression / 27 guard) is a strict
 * superset of legacy's, and its engine is the pure core; this file now also routes
 * V2's side-effects through the SAME prod seams legacy uses (undo window, pipeline
 * tracking, audit activity, weekend-skip scheduling) — so flipping SEQUENCE_ENGINE_V2
 * is an upgrade with no regression, and the legacy body can be retired afterward.
 *
 * Step idempotency rides on outbound existence: a step whose outbound row already
 * exists maps to `sent`, so the engine never re-sends it.
 */

import { db as defaultDb } from "@/db";
import { sequenceEnrollments, sequenceSteps, contacts, outboundEmails, tenants } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decideRouteMode } from "@/lib/sequence-drafts/router";
import { advance } from "./engine";
import type { SequenceDefinition, SequenceStep, Enrollment, EnrollmentStatus, StepState } from "./types";
import { isEmailKnownUnsendable } from "@/lib/contacts/email/db-status";
import { isSuppressed as isOptoutSuppressed } from "@/lib/guardrails/sending-gate";
import { isSuppressedDb, drizzleSuppressionLoader } from "@/lib/suppression/db-store";
import { releaseEnrollment } from "@/lib/anti-collision/enroll-guard";
import { buildProspectContext } from "@/lib/context/prospect-context";
import { personalizeStepEmail } from "@/lib/agents/sequence-generator";
import { STEP_STRATEGIES } from "@/lib/scoring/outbound-methodologies";
import { guardTrippedForTenant } from "@/lib/deliverability/db-guard";
import { generateCopyMessage, persistShadowSample, isCopyEnginePrimaryEnabled } from "@/lib/copy/personalization/db-shadow";
import { resolveTenantCopyLang } from "@/lib/copy/assets/db-store";
// Best-of-both parity: route V2's send + scheduling through the SAME production
// seams the legacy sendSequenceStep uses, so flipping SEQUENCE_ENGINE_V2 is an
// upgrade with no regression on the undo window / observability / audit / weekends.
import { enqueueOutbound } from "@/lib/emails/outbound-hold";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { trackPipeline } from "@/lib/analytics/pipeline-tracker";
import { addBusinessDays } from "@/lib/util/business-days";
import { activities } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Weekend-aware next-step scheduling, matching legacy sendSequenceStep. The engine
 * computes a calendar dueAt; when the tenant skips weekends (default), convert the
 * engine's day-delay into business days from `now` so a follow-up never lands on a
 * Saturday. Pure → unit-tested.
 */
export function businessAwareDueAt(now: number, dueAt: number, skipWeekends: boolean): Date {
  if (!skipWeekends || dueAt <= now) return new Date(dueAt);
  const days = Math.round((dueAt - now) / DAY_MS);
  if (days <= 0) return new Date(dueAt);
  return addBusinessDays(new Date(now), days);
}

/** Substitute {{firstName}}-style template vars. */
export function applyVars(text: string, vars: Record<string, string>): string {
  let out = text ?? "";
  for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  return out;
}

/** The flag. Default OFF — the old runtime stays primary until this is flipped. */
export function isSequenceEngineV2Enabled(): boolean {
  const v = process.env.SEQUENCE_ENGINE_V2;
  return v === "1" || v === "true";
}

/** Live enrollment_status -> engine status. replied/bounced/unsubscribed are terminal halts. */
export function toEngineStatus(s: string | null | undefined): EnrollmentStatus {
  switch (s) {
    case "paused": return "paused";
    case "completed": return "completed";
    case "replied":
    case "bounced":
    case "unsubscribed": return "halted";
    default: return "active";
  }
}

/** Engine status -> a live enrollment_status the schema enum accepts. */
export function toLiveStatus(s: EnrollmentStatus): "active" | "paused" | "completed" {
  return s === "halted" ? "completed" : s === "paused" ? "paused" : s === "completed" ? "completed" : "active";
}

function stepKind(stepType: string): SequenceStep["kind"] {
  if (stepType === "email") return "email";
  if (stepType.startsWith("linkedin")) return "linkedin";
  return "wait";
}

interface StepRow { id: string; stepNumber: number; stepType: string; subjectTemplate: string; bodyTemplate: string; delayDays: number | null }

/** Build the engine's SequenceDefinition from the live sequence_steps (ordered). */
export function buildDefinition(sequenceId: string, steps: StepRow[]): SequenceDefinition {
  const ordered = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
  return {
    id: sequenceId,
    steps: ordered.map((s) => ({ id: s.id, kind: stepKind(s.stepType), delayMs: (s.delayDays ?? 0) * DAY_MS })),
  };
}

/**
 * Build the engine Enrollment from the live row. Step state is derived from
 * which step numbers already have an outbound (idempotency). currentStepIndex is
 * the live 1-based currentStep minus one.
 */
export function buildEngineEnrollment(
  row: { id: string; contactId: string; sequenceId: string; status: string | null; currentStep: number | null; nextStepAt: Date | null },
  def: SequenceDefinition,
  sentStepNumbers: Set<number>,
  now: number,
): Enrollment {
  const steps: StepState[] = def.steps.map((s, idx) => ({
    stepId: s.id,
    status: sentStepNumbers.has(idx + 1) ? "sent" : "pending",
  }));
  return {
    id: row.id,
    contactId: row.contactId,
    sequenceId: row.sequenceId,
    status: toEngineStatus(row.status),
    currentStepIndex: Math.max(0, (row.currentStep ?? 1) - 1),
    dueAt: row.nextStepAt ? row.nextStepAt.getTime() : now,
    steps,
  };
}

export interface TickOutcome {
  enrollmentId: string;
  ran: boolean;
  status?: EnrollmentStatus;
  currentStepIndex?: number;
  reason?: string;
}

/**
 * One V2 conductor tick for a live enrollment. Loads → maps → advance → persists.
 * The sendEmail port queues an outbound; the engine handles delay/idempotency/
 * suppression/lock-release. Returns what happened.
 */
export async function tickEnrollmentV2(enrollmentId: string, database: typeof defaultDb = defaultDb): Promise<TickOutcome> {
  const now = Date.now();
  const [row] = await database.select().from(sequenceEnrollments).where(eq(sequenceEnrollments.id, enrollmentId)).limit(1);
  if (!row) return { enrollmentId, ran: false, reason: "not found" };
  if (row.status !== "active") return { enrollmentId, ran: false, reason: `not active (${row.status})` };

  const [contact] = await database.select({ id: contacts.id, email: contacts.email, tenantId: contacts.tenantId, companyId: contacts.companyId, emailStatus: contacts.emailStatus, firstName: contacts.firstName, lastName: contacts.lastName, title: contacts.title }).from(contacts).where(eq(contacts.id, row.contactId)).limit(1);
  if (!contact?.email) return { enrollmentId, ran: false, reason: "no contact email" };
  const tenantId = contact.tenantId;
  // Full tenant settings — read once for the undo window (enqueueOutbound) + the
  // weekend-skip scheduling, both legacy parity.
  const fullSettings = await getTenantSettings(tenantId).catch(() => null);
  // Captured by pullVariant, read by sendEmail to tag template-only fallbacks
  // (legacy `[fallback:...]` observability). Reset per step inside pullVariant.
  let lastFallbackReason: string | null = null;

  // Spec 25 parity — respect manual-approval mode. The legacy sendSequenceStep
  // bails on manual so routeSequenceStepToDraft writes a draft; that draft router
  // STILL runs under V2, so V2 must also bail or a manual tenant gets
  // double-processed (an auto-queued outbound AND a draft).
  const [tenantRow] = await database.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (decideRouteMode((tenantRow?.settings as Record<string, unknown> | null) ?? null) === "manual") {
    return { enrollmentId, ran: false, reason: "manual approval — draft router handles it" };
  }

  const stepRows = (await database.select().from(sequenceSteps).where(eq(sequenceSteps.sequenceId, row.sequenceId))) as unknown as StepRow[];
  const def = buildDefinition(row.sequenceId, stepRows);

  const outRows = await database.select({ stepNumber: outboundEmails.stepNumber }).from(outboundEmails).where(eq(outboundEmails.enrollmentId, enrollmentId));
  const sentStepNumbers = new Set<number>(outRows.map((o) => o.stepNumber as number));

  const enrollment = buildEngineEnrollment(row, def, sentStepNumbers, now);

  const stepNumberByStepId = new Map(def.steps.map((s, idx) => [s.id, idx + 1]));

  const next = await advance(enrollment, def, {
    isEligible: () => !isEmailKnownUnsendable(contact.emailStatus),
    isSuppressed: async () => {
      if (await isOptoutSuppressed(tenantId, contact.email!)) return true;
      const hit = await isSuppressedDb({ email: contact.email!, tenantId }, drizzleSuppressionLoader());
      return hit !== null;
    },
    acquireLock: async () => true, // already enrolled; advance never acquires.
    releaseLock: async () => releaseEnrollment(tenantId, contact.id),
    pullVariant: async (step) => {
      lastFallbackReason = null;
      const sr = stepRows.find((s) => s.id === step.id);
      if (!sr) return null;
      const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
      const vars = {
        firstName: contact.firstName ?? "",
        lastName: contact.lastName ?? "",
        fullName,
        title: contact.title ?? "",
      };
      let subject = applyVars(sr.subjectTemplate, vars);
      let body = applyVars(sr.bodyTemplate, vars);
      // LLM personalization parity with the legacy path (spec-19/sequence-generator).
      // personalizeStepEmail already falls back to the template when no model is
      // configured; we also fall back (template-only) on any throw. Legacy parity:
      // record WHY we fell back so sendEmail can tag the outbound (review-queue
      // visibility) instead of silently shipping a template-only email.
      try {
        const ctx = await buildProspectContext(contact.id, tenantId);
        if (ctx) {
          const stepNumber = stepNumberByStepId.get(step.id) ?? enrollment.currentStepIndex + 1;
          const strategy = STEP_STRATEGIES.find((s) => s.stepNumber === stepNumber) ?? STEP_STRATEGIES[0];
          const out = await personalizeStepEmail(ctx, { subject, body }, strategy, tenantId);
          subject = out.subject;
          body = out.body;
        } else {
          lastFallbackReason = "missing_prospect_context";
        }
      } catch {
        lastFallbackReason = "llm_personalize_threw";
        /* template-only fallback — keep the substituted subject/body */
      }
      // Spec 19/20 CUTOVER (V2 path) — when COPY_ENGINE_PRIMARY is on, the grounded
      // copy engine becomes the primary copy, but ONLY when high-personalization;
      // else keep the legacy personalisation above. Never degrades. Best-effort.
      if (isCopyEnginePrimaryEnabled()) {
        try {
          const lang = await resolveTenantCopyLang(tenantId);
          const out = await generateCopyMessage(contact.id, tenantId, { lang });
          if (out.ran && out.message && out.message.personalization_level === "high") {
            await persistShadowSample(tenantId, contact.id, lang, out.message, out.evidenceCount ?? 0);
            subject = out.message.subject ?? subject;
            body = out.message.body;
            lastFallbackReason = null; // grounded copy is not a template fallback
          }
        } catch {
          /* keep the legacy personalisation */
        }
      }
      return { id: step.id, subject, body };
    },
    sendEmail: async (step, _contactId, variant) => {
      const stepNumber = stepNumberByStepId.get(step.id) ?? (enrollment.currentStepIndex + 1);
      const subject = variant.subject ?? "";
      const body = variant.body ?? "";
      // Legacy parity: route through enqueueOutbound so the tenant's CLE-11 undo
      // window applies (queued vs held+holdUntil). NOT best-effort — the row IS
      // the send, so a failure must surface (the engine treats a throw as un-sent).
      const result = await enqueueOutbound({
        tenantId,
        enrollmentId,
        contactId: contact.id,
        stepNumber,
        to: contact.email!,
        subject,
        bodyHtml: `<div>${body.replace(/\n/g, "<br>")}</div>`,
        bodyText: body,
        errorMessage: lastFallbackReason
          ? `[fallback:${lastFallbackReason}] sent with template-only personalisation`
          : null,
        settings: fullSettings ?? undefined,
      });
      // Analytics + audit parity (best-effort — observability must not fail a send).
      await trackPipeline({
        traceId: enrollmentId,
        tenantId,
        companyId: contact.companyId ?? null,
        contactId: contact.id,
        enrollmentId,
        outboundEmailId: result.id,
        stage: "email_queued",
        sourceSystem: "inngest",
        metadata: { step: stepNumber, subject },
      }).catch(() => {});
      await database
        .insert(activities)
        .values({
          tenantId,
          actorType: "system",
          actorId: null,
          entityType: "contact",
          entityId: contact.id,
          activityType: "sequence_step_sent",
          channel: "email",
          direction: "outbound",
          summary: `Sequence step ${stepNumber}: ${subject}`,
          rawContent: body,
          metadata: { sequenceId: row.sequenceId, stepNumber, enrollmentId, outboundEmailId: result.id, to: contact.email },
        })
        .catch(() => {});
    },
    sendLinkedIn: async () => { /* spec-24 dispatch — out of scope for this slice */ },
    // Spec 27 — deliverability guard: pauses the sequence when the tenant's
    // bounce/spam rate breaches threshold (no-op below the min sample / when healthy).
    isGuardTripped: async () => guardTrippedForTenant(tenantId, { now }),
    newId: () => crypto.randomUUID(),
    now: () => now,
  });

  // Persist the engine result back to the live row. Legacy parity: weekend-aware
  // nextStepAt for an active enrollment; null once terminal (completed/halted).
  const liveStatus = toLiveStatus(next.status);
  const skipWeekends = (fullSettings as { sequencesSkipWeekends?: boolean } | null)?.sequencesSkipWeekends !== false;
  await database
    .update(sequenceEnrollments)
    .set({
      status: liveStatus,
      currentStep: next.currentStepIndex + 1,
      nextStepAt: liveStatus === "active" ? businessAwareDueAt(now, next.dueAt, skipWeekends) : null,
      lastStepAt: new Date(now),
    })
    .where(eq(sequenceEnrollments.id, enrollmentId));

  return { enrollmentId, ran: true, status: next.status, currentStepIndex: next.currentStepIndex };
}
