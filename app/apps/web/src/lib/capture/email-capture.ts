/**
 * Single-message inbound-email capture (Lightfield-parity capture loop).
 *
 * The EmailEngine webhook receives a real-time `messageNew` for every inbound
 * email, but historically only flipped `repliedAt` on the matching outbound
 * row and dropped everything else — so a reply's actual body, and ANY inbound
 * that wasn't a sequence reply, never became a first-class record.
 *
 * This is the per-message sibling of the batch `POST /api/email/sync` pull
 * path: it resolves the sender to a contact (or a known company), then records
 * the inbound email as an `activities` row (email_received / channel email /
 * direction inbound) through the same `recordCapturedActivity` seam — so it
 * honours the tenant's capture-approval mode, flows into the unified timeline
 * that accounts/contacts already read for "last interaction", and is embedded
 * for chat/RAG.
 *
 * Scope (deliberate): captures inbound we can confidently attribute — a tracked
 * thread reply, a known contact, or a known company domain (auto-creating the
 * contact only when the tenant opted in via contactCreationMode). Inbound from
 * a wholly-unknown sender is left for a future cold-inbound triage increment
 * rather than auto-creating contact spam or inserting orphan activities.
 */

import { db } from "@/db";
import { activities, contacts, companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recordCapturedActivity, getCaptureApprovalMode } from "@/lib/capture/approval";
import {
  getTenantSettings,
  buildIgnoredDomains,
  shouldAutoCreateContact,
} from "@/lib/config/tenant-settings";
import { embedEntity } from "@/lib/ai/embeddings";
import { ingestEpisode } from "@/lib/ai/context-graph";

/** "John Doe <john@example.com>" -> "john@example.com" (lowercased). */
export function extractEmailFromHeader(header: string): string {
  const m = header?.match(/<([^>]+)>/);
  return (m ? m[1] : header || "").trim().toLowerCase();
}

/** "John Doe <john@example.com>" -> { firstName: "John", lastName: "Doe" }. */
function extractNameFromHeader(header: string): { firstName: string; lastName: string } {
  const nameMatch = header?.match(/^([^<]+)</);
  if (nameMatch) {
    const parts = nameMatch[1].trim().replace(/"/g, "").split(/\s+/);
    return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "" };
  }
  const email = extractEmailFromHeader(header);
  const prefix = email.split("@")[0] || "";
  const parts = prefix.split(/[._-]/);
  return {
    firstName: parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "",
    lastName: parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : "",
  };
}

export interface InboundEmailInput {
  tenantId: string;
  /** Raw `From` header ("Name <addr>") or a bare address. */
  fromHeader: string;
  toHeader?: string | null;
  subject?: string | null;
  text?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  /** When the inbound is a reply to a tracked outbound, its contactId. */
  knownContactId?: string | null;
  occurredAt?: Date;
}

export interface InboundCaptureResult {
  /** true → an activities row was inserted now. */
  captured: boolean;
  reason?: "duplicate" | "unresolved_sender" | "queued_for_review";
  activityId?: string;
  approvalId?: string;
  contactId?: string | null;
  companyId?: string | null;
}

/**
 * Capture one inbound email as a first-class activity. Idempotent on
 * `messageId` (auto-mode inserts have no built-in dedup, so we guard here).
 */
export async function captureInboundEmail(
  input: InboundEmailInput,
): Promise<InboundCaptureResult> {
  const { tenantId } = input;
  const senderEmail = extractEmailFromHeader(input.fromHeader || "");
  const messageId = input.messageId || null;

  // Idempotency: skip if this messageId is already captured for the tenant.
  if (messageId) {
    const [dup] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, tenantId),
          eq(activities.channel, "email"),
          sql`(${activities.metadata} ->> 'messageId') = ${messageId}`,
        ),
      )
      .limit(1);
    if (dup) return { captured: false, reason: "duplicate", activityId: dup.id };
  }

  // Resolve the contact: explicit thread reply -> existing by sender -> create.
  let contact: { id: string; companyId: string | null } | null = null;
  if (input.knownContactId) {
    const [c] = await db
      .select({ id: contacts.id, companyId: contacts.companyId })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, input.knownContactId),
          eq(contacts.tenantId, tenantId),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);
    if (c) contact = c;
  }
  if (!contact && senderEmail) {
    const [c] = await db
      .select({ id: contacts.id, companyId: contacts.companyId })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          eq(contacts.email, senderEmail),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);
    if (c) contact = c;
  }

  const settings = await getTenantSettings(tenantId);
  const ownDomain = (settings.companyDomain || "").toLowerCase().replace(/^www\./, "");
  const ignoredDomains = buildIgnoredDomains(settings, ownDomain);
  const domain = senderEmail.split("@")[1]?.toLowerCase().replace(/^www\./, "") || "";

  // For a known/business domain with no contact yet: attach to the company,
  // and auto-create the contact only when the tenant opted in for inbound.
  let companyId: string | null = contact?.companyId ?? null;
  if (!contact && domain && !ignoredDomains.has(domain)) {
    const [existingCo] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, tenantId),
          eq(companies.domain, domain),
          isNull(companies.deletedAt),
        ),
      )
      .limit(1);
    let resolvedCompanyId: string | null = existingCo?.id ?? null;

    if (shouldAutoCreateContact(settings.contactCreationMode, "inbound")) {
      if (!resolvedCompanyId) {
        const base = domain.split(".")[0] || domain;
        const [newCo] = await db
          .insert(companies)
          .values({ tenantId, name: base.charAt(0).toUpperCase() + base.slice(1), domain })
          .returning({ id: companies.id });
        resolvedCompanyId = newCo.id;
      }
      const nm = extractNameFromHeader(input.fromHeader || "");
      const [newContact] = await db
        .insert(contacts)
        .values({
          tenantId,
          firstName: nm.firstName || null,
          lastName: nm.lastName || null,
          email: senderEmail,
          companyId: resolvedCompanyId,
        })
        .returning({ id: contacts.id, companyId: contacts.companyId });
      contact = newContact;
      companyId = newContact.companyId;
    } else {
      companyId = resolvedCompanyId;
    }
  }

  // Require a contact or a known company — never insert an orphan activity.
  let entityType: "contact" | "company";
  let entityId: string;
  if (contact) {
    entityType = "contact";
    entityId = contact.id;
  } else if (companyId) {
    entityType = "company";
    entityId = companyId;
  } else {
    return { captured: false, reason: "unresolved_sender" };
  }

  const mode = getCaptureApprovalMode(settings as unknown as Record<string, unknown>);
  const occurredAt = input.occurredAt ?? new Date();

  const res = await recordCapturedActivity({
    tenantId,
    mode,
    kind: "email",
    sourceRef: messageId,
    activity: {
      tenantId,
      actorType: "contact",
      actorId: contact?.id ?? null,
      entityType,
      entityId,
      activityType: "email_received",
      channel: "email",
      direction: "inbound",
      occurredAt,
      summary: input.subject || "(no subject)",
      rawContent: input.text || null,
      threadId: input.threadId || null,
      metadata: {
        messageId,
        threadId: input.threadId || null,
        from: input.fromHeader,
        to: input.toHeader || null,
        subject: input.subject || null,
        snippet: (input.text || "").slice(0, 200),
      },
    },
    summary: input.subject || null,
  });

  // Make the inbound searchable in chat/RAG + memory graph (non-blocking,
  // and only once the activity is actually live — not while pending review).
  if (res.applied && input.text) {
    if (process.env.OPENAI_API_KEY) {
      const toEmbed = `Email: ${input.subject || ""}\nFrom: ${input.fromHeader}\n\n${input.text.slice(0, 5000)}`;
      void embedEntity(tenantId, entityType, `${entityId}-email-${messageId ?? occurredAt.getTime()}`, toEmbed).catch(() => {});
    }
    void ingestEpisode(
      tenantId,
      `Inbound email from ${input.fromHeader}:\nSubject: ${input.subject || ""}\n\n${input.text.slice(0, 3000)}`,
      "email",
      messageId ?? undefined,
    ).catch(() => {});
  }

  return {
    captured: res.applied,
    reason: res.applied ? undefined : "queued_for_review",
    activityId: res.activityId,
    approvalId: res.approvalId,
    contactId: contact?.id ?? null,
    companyId,
  };
}
