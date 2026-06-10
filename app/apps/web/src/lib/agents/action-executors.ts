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
import { tasks, deals, companies, contacts } from "@/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { deliverInteractiveEmail } from "@/lib/emails/deliver-interactive";

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

    // LLM-only, lower-frequency types — fail closed until each carries a
    // validated param schema (no risky CRM mutation from unstructured params).
    case "advance_deal":
    case "enroll_sequence":
      return { ok: false, error: `approval executor pending for "${action.actionType}"` };

    default:
      return { ok: false, error: `no executor for action type "${action.actionType}"` };
  }
}
