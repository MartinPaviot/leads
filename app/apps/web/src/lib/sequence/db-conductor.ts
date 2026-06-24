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
 *   - pullVariant -> the sequence_steps template (LLM personalization parity is a
 *                    documented follow-up; the slot/variant store is spec-20)
 *   - sendEmail   -> queue an outbound_emails row (the email-send-worker sends it)
 *   - isGuardTripped -> false (spec-27 deliverability guard is a follow-up)
 *
 * Step idempotency rides on outbound existence: a step whose outbound row already
 * exists maps to `sent`, so the engine never re-sends it.
 */

import { db as defaultDb } from "@/db";
import { sequenceEnrollments, sequenceSteps, contacts, outboundEmails } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { advance } from "./engine";
import type { SequenceDefinition, SequenceStep, Enrollment, EnrollmentStatus, StepState } from "./types";
import { isEmailKnownUnsendable } from "@/lib/contacts/email/db-status";
import { isSuppressed as isOptoutSuppressed } from "@/lib/guardrails/sending-gate";
import { isSuppressedDb, drizzleSuppressionLoader } from "@/lib/suppression/db-store";
import { releaseEnrollment } from "@/lib/anti-collision/enroll-guard";
import { buildProspectContext } from "@/lib/context/prospect-context";
import { personalizeStepEmail } from "@/lib/agents/sequence-generator";
import { STEP_STRATEGIES } from "@/lib/scoring/outbound-methodologies";

const DAY_MS = 24 * 60 * 60 * 1000;

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

  const [contact] = await database.select({ id: contacts.id, email: contacts.email, tenantId: contacts.tenantId, emailStatus: contacts.emailStatus, firstName: contacts.firstName, lastName: contacts.lastName, title: contacts.title }).from(contacts).where(eq(contacts.id, row.contactId)).limit(1);
  if (!contact?.email) return { enrollmentId, ran: false, reason: "no contact email" };
  const tenantId = contact.tenantId;

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
      // configured; we also fall back (template-only) on any throw.
      try {
        const ctx = await buildProspectContext(contact.id, tenantId);
        if (ctx) {
          const stepNumber = stepNumberByStepId.get(step.id) ?? enrollment.currentStepIndex + 1;
          const strategy = STEP_STRATEGIES.find((s) => s.stepNumber === stepNumber) ?? STEP_STRATEGIES[0];
          const out = await personalizeStepEmail(ctx, { subject, body }, strategy, tenantId);
          subject = out.subject;
          body = out.body;
        }
      } catch {
        /* template-only fallback — keep the substituted subject/body */
      }
      return { id: step.id, subject, body };
    },
    sendEmail: async (step, _contactId, variant) => {
      const stepNumber = stepNumberByStepId.get(step.id) ?? (enrollment.currentStepIndex + 1);
      await database.insert(outboundEmails).values({
        tenantId,
        enrollmentId,
        contactId: contact.id,
        stepNumber,
        fromAddress: "pending@rotation",
        toAddress: contact.email!,
        subject: variant.subject ?? "",
        bodyHtml: `<div>${(variant.body ?? "").replace(/\n/g, "<br>")}</div>`,
        bodyText: variant.body ?? "",
        status: "queued",
        queuedAt: new Date(),
      });
    },
    sendLinkedIn: async () => { /* spec-24 dispatch — out of scope for this slice */ },
    isGuardTripped: async () => false, // spec-27 — follow-up
    newId: () => crypto.randomUUID(),
    now: () => now,
  });

  // Persist the engine result back to the live row.
  await database
    .update(sequenceEnrollments)
    .set({
      status: toLiveStatus(next.status),
      currentStep: next.currentStepIndex + 1,
      nextStepAt: new Date(next.dueAt),
      lastStepAt: new Date(now),
    })
    .where(eq(sequenceEnrollments.id, enrollmentId));

  return { enrollmentId, ran: true, status: next.status, currentStepIndex: next.currentStepIndex };
}
