/**
 * Post-call CRM auto-loop — the "actualisation automatique du CRM".
 *
 * After a call is transcribed and classified, this turns what was said into
 * CRM state the rep would otherwise enter by hand:
 *   - meeting booked        -> open (or advance) a deal for the account, with
 *                              value/close-date/buying-signals from the call
 *   - not interested        -> close any open deal as lost
 *   - action items / callback -> create tasks (callback due when asked)
 *   - every call            -> stamp the contact's last-call disposition
 *
 * Idempotent: only one open deal per account, and tasks are tagged with the
 * call id so re-processing the same call doesn't duplicate them.
 */

import { db } from "@/db";
import { deals, tasks, contacts, companies } from "@/db/schema";
import { and, eq, isNull, inArray, desc, sql } from "drizzle-orm";
import type { CallNotes } from "./extraction-schema";

const OPEN_STAGES = ["lead", "qualification", "demo", "trial", "proposal", "negotiation"] as const;

/** "$48k", "around 50k for the year", "50,000" -> 48000 / 50000. */
export function parseMoney(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/[, ]/g, "").match(/(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  if (unit === "k" || unit === "thousand") n *= 1_000;
  else if (unit === "m" || unit === "million") n *= 1_000_000;
  return Math.round(n);
}

/** Parse a free-text date; null when unparseable or implausible (no crash). */
export function parseLooseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 2020 || y > 2035) return null;
  return d;
}

export interface ApplyCallArgs {
  tenantId: string;
  callId: string;
  contactId: string;
  companyId: string | null;
  ownerId: string | null;
  notes: CallNotes;
  occurredAt: Date;
}

export interface ApplyCallResult {
  dealId: string | null;
  dealAction: "created" | "updated" | "closed_lost" | null;
  tasksCreated: number;
  contactPatched: boolean;
}

export async function applyCallToCrm(args: ApplyCallArgs): Promise<ApplyCallResult> {
  const { tenantId, callId, contactId, ownerId, notes, occurredAt } = args;
  const result: ApplyCallResult = { dealId: null, dealAction: null, tasksCreated: 0, contactPatched: false };

  // Resolve the company (from the contact if not given).
  let companyId = args.companyId;
  if (!companyId) {
    const [c] = await db
      .select({ companyId: contacts.companyId })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)))
      .limit(1);
    companyId = c?.companyId ?? null;
  }

  const outcome = notes.outcome;
  const bs = notes.buyingSignals;
  const dealValue = parseMoney(bs.budget);
  const closeDate = parseLooseDate(bs.timeline) ?? parseLooseDate(notes.callbackRequest?.whenIso ?? null);
  const signalProps = {
    budget: bs.budget ?? null,
    timeline: bs.timeline ?? null,
    painPoints: bs.painPoints ?? [],
    nextSteps: bs.nextSteps ?? [],
    competitors: bs.competitors ?? [],
    teamSize: bs.teamSize ?? null,
    currentStack: bs.currentStack ?? [],
    initiatives: bs.initiatives ?? [],
  };
  // MEDDPICC qualification spine + provenance, carried on the deal so the
  // scorecard fills in across calls (the empty cells are the next call's agenda).
  const meddicProps = notes.meddic
    ? { ...notes.meddic, competition: bs.competitors ?? [], updatedFromCallId: callId, updatedAt: occurredAt.toISOString() }
    : null;
  const evidence = (notes.evidence ?? []).slice(0, 12);

  // Existing open deal for this account (most recent).
  let openDeal: { id: string; stage: string | null; value: number | null; expectedCloseDate: Date | null; properties: unknown } | null = null;
  if (companyId) {
    const [d] = await db
      .select({ id: deals.id, stage: deals.stage, value: deals.value, expectedCloseDate: deals.expectedCloseDate, properties: deals.properties })
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.companyId, companyId), isNull(deals.deletedAt), inArray(deals.stage, [...OPEN_STAGES])))
      .orderBy(desc(deals.updatedAt))
      .limit(1);
    openDeal = d ?? null;
  }

  // ── Deal routing ───────────────────────────────────────────────────────
  if (outcome === "not_interested" && openDeal) {
    await db
      .update(deals)
      .set({
        stage: "lost",
        properties: { ...((openDeal.properties as Record<string, unknown>) || {}), lostReason: "not_interested (call)", lostCallId: callId },
        updatedAt: occurredAt,
      })
      .where(eq(deals.id, openDeal.id));
    result.dealId = openDeal.id;
    result.dealAction = "closed_lost";
  } else if (companyId && (outcome === "meeting_booked" || (outcome === "connected" && notes.sentiment === "positive"))) {
    if (!openDeal) {
      // Create a deal only for a clear-intent call.
      if (outcome === "meeting_booked" || dealValue != null || closeDate != null || bs.nextSteps.length > 0) {
        const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
        const dealName = co?.name ? `${co.name} - opportunity` : "Opportunity (from call)";
        const [created] = await db
          .insert(deals)
          .values({
            tenantId,
            companyId,
            contactId,
            ownerId: ownerId ?? null,
            name: dealName,
            stage: outcome === "meeting_booked" ? "demo" : "qualification",
            value: dealValue,
            expectedCloseDate: closeDate,
            summary: notes.summary,
            properties: { source: "call", callId, buyingSignals: signalProps, ...(meddicProps ? { meddic: meddicProps } : {}), ...(evidence.length ? { evidence } : {}) },
          })
          .returning({ id: deals.id });
        result.dealId = created.id;
        result.dealAction = "created";
      }
    } else {
      // Patch the existing deal with anything newly learned.
      const patch: Record<string, unknown> = {
        properties: { ...((openDeal.properties as Record<string, unknown>) || {}), buyingSignals: signalProps, ...(meddicProps ? { meddic: meddicProps } : {}), ...(evidence.length ? { evidence } : {}), lastCallId: callId },
        updatedAt: occurredAt,
      };
      if (openDeal.value == null && dealValue != null) patch.value = dealValue;
      if (openDeal.expectedCloseDate == null && closeDate != null) patch.expectedCloseDate = closeDate;
      // A booked meeting advances an early-stage deal.
      if (outcome === "meeting_booked" && (openDeal.stage === "lead" || openDeal.stage === "qualification")) patch.stage = "demo";
      await db.update(deals).set(patch).where(eq(deals.id, openDeal.id));
      result.dealId = openDeal.id;
      result.dealAction = "updated";
    }
  }

  // ── Account update ───────────────────────────────────────────────────────
  // Stamp what the call revealed about the ORG onto the company (the replaceable
  // stack is the Pilae lever) so the account fiche reflects it. Namespaced under
  // properties.callIntel; provenance = this call. Non-fatal.
  if (companyId && (bs.currentStack.length || bs.competitors.length || bs.teamSize || bs.initiatives.length)) {
    try {
      const [co] = await db.select({ properties: companies.properties }).from(companies).where(eq(companies.id, companyId)).limit(1);
      const cprops = (co?.properties as Record<string, unknown>) || {};
      const prevIntel = (cprops.callIntel as Record<string, unknown>) || {};
      await db
        .update(companies)
        .set({
          properties: {
            ...cprops,
            callIntel: {
              ...prevIntel,
              stack: bs.currentStack.length ? bs.currentStack : prevIntel.stack ?? [],
              competitors: bs.competitors.length ? bs.competitors : prevIntel.competitors ?? [],
              teamSize: bs.teamSize ?? prevIntel.teamSize ?? null,
              initiatives: bs.initiatives.length ? bs.initiatives : prevIntel.initiatives ?? [],
              updatedFromCallId: callId,
              updatedAt: occurredAt.toISOString(),
            },
          },
          updatedAt: occurredAt,
        })
        .where(eq(companies.id, companyId));
    } catch {
      // Non-fatal — account intel never blocks the call loop.
    }
  }

  // ── Tasks ──────────────────────────────────────────────────────────────
  // Idempotency: tag descriptions with [call:<id>] and skip if already present.
  const existingTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.tenantId, tenantId), sql`${tasks.description} LIKE ${"%[call:" + callId + "]%"}`))
    .limit(1);

  if (existingTasks.length === 0) {
    const toCreate: (typeof tasks.$inferInsert)[] = [];
    const tag = `[call:${callId}]`;

    if (notes.callbackRequest?.requested) {
      toCreate.push({
        tenantId,
        assigneeId: ownerId ?? null,
        entityType: "contact",
        entityId: contactId,
        title: "Call back — requested on the call",
        description: `${notes.callbackRequest.note || "Prospect asked for a callback."} ${tag}`,
        dueDate: parseLooseDate(notes.callbackRequest.whenIso) ?? new Date(occurredAt.getTime() + 86_400_000),
        priority: "high",
        status: "pending",
      });
    }
    for (const ai of (notes.actionItems ?? []).slice(0, 5)) {
      if (!ai.task?.trim()) continue;
      toCreate.push({
        tenantId,
        assigneeId: ownerId ?? null,
        entityType: "contact",
        entityId: contactId,
        title: ai.task.slice(0, 200),
        description: `Owner: ${ai.owner || "—"} ${tag}`,
        dueDate: parseLooseDate(ai.deadline),
        priority: "medium",
        status: "pending",
      });
    }
    if (toCreate.length > 0) {
      await db.insert(tasks).values(toCreate);
      result.tasksCreated = toCreate.length;
    }
  }

  // ── Contact disposition stamp ────────────────────────────────────────────
  try {
    const [c] = await db.select({ properties: contacts.properties }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
    const props = (c?.properties as Record<string, unknown>) || {};
    await db
      .update(contacts)
      .set({
        properties: { ...props, lastCall: { outcome, sentiment: notes.sentiment, at: occurredAt.toISOString(), callId }, ...(notes.contactProfile ? { callProfile: { ...notes.contactProfile, updatedFromCallId: callId, updatedAt: occurredAt.toISOString() } } : {}) },
        updatedAt: occurredAt,
      })
      .where(eq(contacts.id, contactId));
    result.contactPatched = true;
  } catch {
    // Non-fatal.
  }

  return result;
}
