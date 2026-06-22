/**
 * Executors for approved agent actions.
 *
 * The agent reactor records an INTENT (`agent_actions` row). When the founder
 * approves it (or an auto-grace window elapses), the dispatcher
 * (inngest/agent-action-dispatcher.ts) calls `executeAgentAction` to actually
 * perform it through EXISTING, already-safe paths:
 *   - email   → deliverInteractiveEmail (enforces OUTBOUND_TEST_MODE, opt-outs,
 *               plan limits, owner mailbox — so a real prospect is never reached
 *               while test-mode is on).
 *   - task    → tasks insert.
 *   - deal    → deals insert (idempotent: skips if the company already has an
 *               open deal).
 *
 * Anything underspecified fails CLOSED with a clear message rather than guessing
 * — we never mutate the CRM from an action whose params we can't validate. The
 * LLM-only action types (advance_deal, enroll_sequence) are intentionally
 * fail-closed in this v1 until they carry a validated param schema.
 *
 * The pure helpers (taskValuesFromAction / dealNameFor / emailIntentFromPayload)
 * are exported for unit testing without a DB.
 */

import { db } from "@/db";
import { tasks, deals, companies, contacts, sequences, sequenceEnrollments } from "@/db/schema";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { deliverInteractiveEmail } from "@/lib/emails/deliver-interactive";
import { loadSuppressedEmails } from "@/lib/sequences/suppression";

export interface ExecutableAction {
  id: string;
  userId: string | null;
  actionType: string;
  payload: Record<string, unknown>;
}

export type ExecResult = { ok: true; detail: string } | { ok: false; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────

/** Build the tasks-insert values from an action payload. Title falls back
 *  through payload.title → expectedOutcome → a safe default. */
export function taskValuesFromAction(
  tenantId: string,
  payload: Record<string, unknown>,
  now: Date,
): {
  tenantId: string;
  title: string;
  entityType: string | null;
  entityId: string | null;
  dueDate: Date;
  status: string;
  priority: string;
} {
  const title = str(payload.title) ?? str(payload.expectedOutcome) ?? "Follow up";
  const dueInDays = num(payload.dueInDays);
  const dueDate = new Date(now.getTime() + (dueInDays != null ? dueInDays : 3) * DAY_MS);
  return {
    tenantId,
    title,
    entityType: str(payload.entityType),
    entityId: str(payload.entityId),
    dueDate,
    status: "pending",
    priority: "medium",
  };
}

const DEAL_STAGES = ["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"] as const;
type DealStage = (typeof DEAL_STAGES)[number];

/** Coerce an untrusted stage param to a valid pipeline stage (default "lead"). */
export function coerceDealStage(v: unknown): DealStage {
  const s = str(v);
  return s && (DEAL_STAGES as readonly string[]).includes(s) ? (s as DealStage) : "lead";
}

/** A deal name for a company-sourced create_deal. */
export function dealNameFor(companyName: string | null, payload: Record<string, unknown>): string {
  const explicit = str(payload.name) ?? str(payload.dealName);
  if (explicit) return explicit;
  return companyName ? `${companyName} — new opportunity` : "New opportunity";
}

/** Resolve the company id a create_deal targets (company-typed entity, or an
 *  explicit companyId param). */
export function companyIdFromPayload(payload: Record<string, unknown>): string | null {
  if (str(payload.entityType) === "company") return str(payload.entityId);
  return str(payload.companyId);
}

/** Resolve subject + body for an email action. Body is REQUIRED (we never send a
 *  canned/placeholder line as if it were a real drafted message). */
export function emailIntentFromPayload(
  payload: Record<string, unknown>,
): { ok: true; subject: string; body: string } | { ok: false; error: string } {
  const body = str(payload.body);
  if (!body) {
    return { ok: false, error: "no drafted body on the action — email drafting at dispatch is not wired" };
  }
  return { ok: true, subject: str(payload.subject) ?? "Following up", body };
}

/** Parse a deferred sequence-enrollment payload (recorded by signalAutoEnroll,
 *  CLE-13) into a validated target, or null if it lacks a sequenceId or any
 *  contactId. This is the "validated param schema" the LLM-only enroll case was
 *  fail-closed waiting for. Exported for unit testing without a DB. */
export function enrollmentTargetsFromPayload(
  payload: Record<string, unknown>,
): { sequenceId: string; contactIds: string[] } | null {
  const sequenceId = str(payload.sequenceId);
  const contactIds = Array.isArray(payload.contactIds)
    ? payload.contactIds.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];
  if (!sequenceId || contactIds.length === 0) return null;
  return { sequenceId, contactIds };
}

// ── Executor ────────────────────────────────────────────────────────

export async function executeAgentAction(
  tenantId: string,
  action: ExecutableAction,
): Promise<ExecResult> {
  const p = action.payload ?? {};
  switch (action.actionType) {
    case "create_task": {
      const values = taskValuesFromAction(tenantId, p, new Date());
      await db.insert(tasks).values(values);
      return { ok: true, detail: `Task created: ${values.title}` };
    }

    case "create_deal": {
      const companyId = companyIdFromPayload(p);
      if (!companyId) return { ok: false, error: "create_deal has no company to attach to" };
      const [company] = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)))
        .limit(1);
      if (!company) return { ok: false, error: "target company not found (deleted?)" };
      // Idempotent: don't create a second open deal for the same company.
      const [openDeal] = await db
        .select({ id: deals.id })
        .from(deals)
        .where(
          and(
            eq(deals.companyId, companyId),
            eq(deals.tenantId, tenantId),
            isNull(deals.deletedAt),
            ne(deals.stage, "won"),
            ne(deals.stage, "lost"),
          ),
        )
        .limit(1);
      if (openDeal) return { ok: true, detail: "Company already has an open deal — skipped" };
      const name = dealNameFor(company.name, p);
      const stage = coerceDealStage(p.stage);
      await db.insert(deals).values({ tenantId, companyId, name, stage });
      return { ok: true, detail: `Deal created: ${name}` };
    }

    case "send_followup":
    case "draft_reply": {
      const contactId = str(p.contactId) ?? (str(p.entityType) === "contact" ? str(p.entityId) : null);
      if (!contactId) return { ok: false, error: "no contact to email" };
      const [contact] = await db
        .select({ email: contacts.email })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)))
        .limit(1);
      if (!contact?.email) return { ok: false, error: "contact has no email address" };
      const intent = emailIntentFromPayload(p);
      if (!intent.ok) return { ok: false, error: intent.error };
      const res = await deliverInteractiveEmail({
        tenantId,
        ownerAppUserId: action.userId,
        to: contact.email,
        subject: intent.subject,
        body: intent.body,
        contactId,
        source: "agent-approval",
      });
      if (res.ok) return { ok: true, detail: `Email sent to ${contact.email} via ${res.via}` };
      return { ok: false, error: `${res.code}: ${res.error}` };
    }

    case "sequence-enrollment": {
      // CLE-13: a deferred signal->sequence enrollment, recorded by
      // signalAutoEnroll with a STRUCTURED payload, so it is validated here (not
      // the fail-closed unstructured case below). Human-gated (runs only on the
      // founder's approval); idempotent; tenant-scoped. The first-step sends it
      // triggers still pass the CLE-10 gate + CLE-13 send guardrails at send time.
      const target = enrollmentTargetsFromPayload(p);
      if (!target) return { ok: false, error: "enrollment payload missing sequenceId or contactIds" };
      const [seq] = await db
        .select({ id: sequences.id })
        .from(sequences)
        .where(and(eq(sequences.id, target.sequenceId), eq(sequences.tenantId, tenantId)))
        .limit(1);
      if (!seq) return { ok: false, error: "sequence not found for this tenant" };
      // Re-validate every contact belongs to THIS tenant and isn't soft-deleted.
      // The payload is a stored-then-replayed snapshot and sequenceEnrollments has
      // no tenantId column, so the contact FK is the only tenant anchor — the
      // executor is the trust boundary, exactly like create_deal / send_followup.
      const validContacts = await db
        .select({ id: contacts.id, email: contacts.email })
        .from(contacts)
        .where(and(inArray(contacts.id, target.contactIds), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)));
      // P0-5 — the deferred executor is the REAL write for autopilot/signal
      // enrollments; drop any address suppressed (bounce/complaint/opt-out).
      const suppressedSet = await loadSuppressedEmails(tenantId, validContacts.map((c) => c.email));
      const validIds = new Set(
        validContacts.filter((c) => !(c.email && suppressedSet.has(c.email.toLowerCase()))).map((c) => c.id),
      );
      let enrolled = 0;
      for (const contactId of target.contactIds) {
        if (!validIds.has(contactId)) continue; // not this tenant's, or soft-deleted
        // Idempotent: skip a contact already enrolled in this sequence (any status).
        const [existing] = await db
          .select({ id: sequenceEnrollments.id })
          .from(sequenceEnrollments)
          .where(and(eq(sequenceEnrollments.sequenceId, target.sequenceId), eq(sequenceEnrollments.contactId, contactId)))
          .limit(1);
        if (existing) continue;
        await db.insert(sequenceEnrollments).values({
          sequenceId: target.sequenceId,
          contactId,
          status: "active",
          currentStep: 1,
          nextStepAt: new Date(),
        });
        enrolled++;
      }
      const name = str(p.sequenceName) ?? "the sequence";
      // Skipped = already-enrolled + any contact that failed the tenant/deletedAt
      // re-validation (so the count stays honest, not just "already enrolled").
      const skipped = target.contactIds.length - enrolled;
      return {
        ok: true,
        detail: `Enrolled ${enrolled} contact${enrolled === 1 ? "" : "s"} in ${name}${skipped > 0 ? ` (${skipped} skipped)` : ""}.`,
      };
    }

    // LLM-only, lower-frequency types — fail closed until each carries a
    // validated param schema (no risky CRM mutation from unstructured params).
    case "advance_deal":
    case "enroll_sequence":
      return { ok: false, error: `approval executor pending for "${action.actionType}"` };

    default:
      return { ok: false, error: `no executor for action type "${action.actionType}"` };
  }
}
