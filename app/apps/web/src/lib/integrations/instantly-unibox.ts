/**
 * Instantly Unibox → Elevay inbox ingestion.
 *
 * Pulls inbound replies from the connected Instantly workspace's Unibox
 * (`GET /api/v2/emails`) and writes them as `email_received` activities — the
 * exact rows the inbox read-model reads (`lib/inbox/load.ts`). Each reply is
 * attributed to the Instantly box that received it (`metadata.to`), so the rep
 * who owns that box (assignment step) sees it in their personal inbox.
 *
 * Capture-ALL: unlike the CRM-gated `captureInboundEmail`, this keeps replies
 * from senders not yet in the CRM (a real outreach inbox must show every
 * reply). Known senders are linked to their contact; unknown senders get the
 * `"unknown"` entity sentinel the sync pipeline already uses.
 *
 * Direction detection is field-name-light and robust: an email is INBOUND iff
 * its Instantly account (`eaccount` = our box) is one of our imported boxes AND
 * the `from` is NOT one of our boxes (i.e. the lead wrote it). No dependency on
 * Instantly's `ue_type` numeric semantics.
 */

import { db } from "@/db";
import { activities, contacts, connectedMailboxes } from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { listInstantlyEmails } from "@/lib/providers/instantly-client";

/** First non-empty string among the candidate fields, lowercased+trimmed. */
function pickEmail(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
    // Some shapes nest as { email: "..." } or [ "..." ].
    if (v && typeof v === "object") {
      const nested = (v as Record<string, unknown>).email ?? (Array.isArray(v) ? v[0] : undefined);
      if (typeof nested === "string" && nested.trim()) return nested.trim().toLowerCase();
    }
  }
  return "";
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

function pickBodyText(obj: Record<string, unknown>): string {
  const body = obj.body;
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.text === "string") return b.text;
    if (typeof b.html === "string") return b.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return pickString(obj, ["body_text", "preview", "snippet"]);
}

export interface NormalizedInbound {
  instantlyEmailId: string;
  fromEmail: string;
  /** Our box that received it (lowercased) — drives inbox attribution. */
  toBox: string;
  subject: string;
  bodyText: string;
  threadId: string | null;
  occurredAt: Date;
}

/**
 * Pure: normalize one Instantly Unibox email to an inbound reply addressed to
 * one of our boxes, or null (outbound, or not for our boxes, or unidentifiable).
 * `boxAddresses` is the lowercased set of our imported Instantly box addresses.
 */
export function normalizeInboundEmail(
  email: Record<string, unknown>,
  ctx: { boxAddresses: Set<string> },
): NormalizedInbound | null {
  const id = pickString(email, ["id", "uuid", "email_id"]);
  if (!id) return null;

  const eaccount = pickEmail(email, ["eaccount", "eaccount_email"]);
  const from = pickEmail(email, ["from_address_email", "from_address", "from"]);
  const to = pickEmail(email, ["to_address_email", "to_address_email_list", "to_address", "to"]);

  // Which of our boxes is on this email? Prefer the Instantly account.
  const toBox = ctx.boxAddresses.has(eaccount)
    ? eaccount
    : ctx.boxAddresses.has(to)
      ? to
      : "";
  if (!toBox) return null;

  // Inbound iff the sender is the lead (not one of our boxes).
  if (!from || from === toBox || ctx.boxAddresses.has(from)) return null;

  const ts =
    pickString(email, ["timestamp_email", "timestamp", "timestamp_created"]) ||
    new Date().toISOString();
  const occurredAt = new Date(ts);

  return {
    instantlyEmailId: id,
    fromEmail: from,
    toBox,
    subject: pickString(email, ["subject"]) || "(no subject)",
    bodyText: pickBodyText(email),
    threadId: pickString(email, ["thread_id", "thread", "threadId"]) || null,
    occurredAt: Number.isFinite(occurredAt.getTime()) ? occurredAt : new Date(),
  };
}

export interface UniboxIngestResult {
  ok: boolean;
  /** Total Unibox emails scanned. */
  scanned: number;
  /** Inbound replies for our boxes. */
  inbound: number;
  /** New activities inserted. */
  inserted: number;
  /** Already present (dedup). */
  skipped: number;
  /** First email's field names — confirms the live shape on first run. */
  sampleFields: string[];
  errorMessage?: string;
}

/**
 * Sync the tenant's Instantly Unibox into `email_received` activities.
 * Idempotent (dedups on `metadata.instantlyEmailId`). Paginates recent Unibox
 * pages; re-running is cheap and safe.
 */
export async function ingestInstantlyUnibox(ctx: {
  tenantId: string;
  apiKey: string;
  maxPages?: number;
}): Promise<UniboxIngestResult> {
  // Our imported Instantly boxes — only ingest replies addressed to these.
  const boxRows = await db
    .select({ addr: connectedMailboxes.emailAddress })
    .from(connectedMailboxes)
    .where(and(eq(connectedMailboxes.tenantId, ctx.tenantId), eq(connectedMailboxes.provider, "instantly")));
  const boxAddresses = new Set(
    boxRows.map((b) => b.addr?.toLowerCase().trim()).filter((a): a is string => !!a),
  );
  if (boxAddresses.size === 0) {
    return { ok: true, scanned: 0, inbound: 0, inserted: 0, skipped: 0, sampleFields: [] };
  }

  // Paginate the Unibox, normalizing inbound replies.
  const maxPages = ctx.maxPages ?? 10;
  const normalized: NormalizedInbound[] = [];
  let sampleFields: string[] = [];
  let scanned = 0;
  let startingAfter: string | undefined;
  for (let p = 0; p < maxPages; p++) {
    const page = await listInstantlyEmails({ apiKey: ctx.apiKey, startingAfter });
    if (!page.ok) {
      return {
        ok: false,
        scanned,
        inbound: normalized.length,
        inserted: 0,
        skipped: 0,
        sampleFields,
        errorMessage: page.errorMessage ?? `HTTP ${page.status}`,
      };
    }
    if (sampleFields.length === 0 && page.emails[0]) sampleFields = Object.keys(page.emails[0]);
    scanned += page.emails.length;
    for (const e of page.emails) {
      const n = normalizeInboundEmail(e, { boxAddresses });
      if (n) normalized.push(n);
    }
    if (!page.nextStartingAfter || page.emails.length === 0) break;
    startingAfter = page.nextStartingAfter;
  }

  if (normalized.length === 0) {
    return { ok: true, scanned, inbound: 0, inserted: 0, skipped: 0, sampleFields };
  }

  // Dedup against already-ingested Instantly replies (no unique constraint on a
  // JSON field, so filter in memory over this tenant's instantly-sourced rows).
  const existingRows = await db
    .select({ eid: sql<string>`${activities.metadata}->>'instantlyEmailId'` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, ctx.tenantId),
        eq(activities.activityType, "email_received"),
        sql`${activities.metadata}->>'source' = 'instantly'`,
      ),
    );
  const existing = new Set(existingRows.map((r) => r.eid).filter(Boolean));
  const fresh = normalized.filter((n) => !existing.has(n.instantlyEmailId));
  if (fresh.length === 0) {
    return { ok: true, scanned, inbound: normalized.length, inserted: 0, skipped: normalized.length, sampleFields };
  }

  // Link known senders to their contact (capture-all: unknown senders still
  // get a row, with the "unknown" entity sentinel the sync already uses).
  const senders = [...new Set(fresh.map((n) => n.fromEmail).filter(Boolean))];
  const contactRows = senders.length
    ? await db
        .select({ id: contacts.id, email: contacts.email })
        .from(contacts)
        .where(and(eq(contacts.tenantId, ctx.tenantId), inArray(contacts.email, senders), isNull(contacts.deletedAt)))
    : [];
  const contactByEmail = new Map(
    contactRows.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]),
  );

  const values = fresh.map((n) => {
    const contactId = contactByEmail.get(n.fromEmail) ?? null;
    return {
      tenantId: ctx.tenantId,
      actorType: "contact",
      actorId: contactId,
      entityType: "contact",
      entityId: contactId ?? "unknown",
      activityType: "email_received" as const,
      channel: "email" as const,
      direction: "inbound" as const,
      occurredAt: n.occurredAt,
      summary: n.subject,
      rawContent: n.bodyText.slice(0, 10000),
      threadId: n.threadId,
      metadata: {
        from: n.fromEmail,
        to: n.toBox,
        subject: n.subject,
        snippet: n.bodyText.slice(0, 200),
        source: "instantly",
        instantlyEmailId: n.instantlyEmailId,
      },
    };
  });

  const inserted = await db.insert(activities).values(values).returning({ id: activities.id });

  return {
    ok: true,
    scanned,
    inbound: normalized.length,
    inserted: inserted.length,
    skipped: normalized.length - inserted.length,
    sampleFields,
  };
}
