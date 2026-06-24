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
 * Scope: every HUMAN inbound is captured (zero-entry capture — the product
 * promise). A real person who emails you has their contact auto-created in
 * every mode but "disabled" — a business-domain sender under their company,
 * a personal/free-mail sender (gmail, outlook, …) as a company-less contact
 * (we never fabricate a "Gmail" account). Previously "selective" silently
 * DROPPED any unknown human sender (no contact, no known company → no
 * activity), so a colleague's or cold prospect's mail never reached the inbox
 * at all — the inbox is the `email_received` activity log, not a raw-mailbox
 * mirror, so a dropped email is invisible forever.
 *
 * Machine-sent gate (unchanged): a noreply@/newsletter/automated sender is
 * never promoted to a person-contact (no fabricated contact, no
 * `contact/created` → enrich/qualify/"Hot inbound" fan-out). It is captured
 * only when its domain is ALREADY a known company (attached there); an unknown
 * machine sender is still left unresolved rather than spamming the inbox.
 *
 * Since the IMAP/Gmail pull-sync unification, ALL inbound paths run through
 * this seam — webhook, 15-min cron, force-sync — so attribution and dedup
 * cannot diverge again.
 */

import { db } from "@/db";
import { activities, contacts, companies, outboundEmails } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recordCapturedActivity, getCaptureApprovalMode } from "@/lib/capture/approval";
import {
  getTenantSettings,
  buildIgnoredDomains,
} from "@/lib/config/tenant-settings";
import { embedEntity } from "@/lib/ai/embeddings";
import { ingestEpisode } from "@/lib/ai/context-graph";
import { inngest } from "@/inngest/client";
import { classifyInboundSender } from "@/lib/inbound/lead-classification";
import { stripDangerousHtml } from "@/lib/inbox/sanitize-email";
import { parseAuthResults } from "@/lib/inbox/sender-auth";
import type { AttachmentMeta } from "@/lib/inbox/attachment-meta";

/** "John Doe <john@example.com>" -> "john@example.com" (lowercased). */
export function extractEmailFromHeader(header: string): string {
  const m = header?.match(/<([^>]+)>/);
  return (m ? m[1] : header || "").trim().toLowerCase();
}

/**
 * Normalize a date that may have crossed an Inngest step boundary. step.run
 * results are JSON round-tripped, so a Date comes back as an ISO STRING —
 * passing that to a drizzle timestamp column throws at insert time and
 * dead-letters the whole sync batch (after the IMAP cursor already advanced:
 * the original silent-loss bug). Invalid/missing values fall back to now.
 */
export function normalizeSyncDate(value: Date | string | null | undefined): Date {
  const d = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
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
  /** Original `text/html` body. Sanitized + stored so the reading pane can
   *  render real HTML (INBOX-R01/R13). Absent ⇒ text-only render. */
  html?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  /** When the inbound is a reply to a tracked outbound, its contactId. */
  knownContactId?: string | null;
  /** May be an ISO string when the caller crossed an Inngest step boundary. */
  occurredAt?: Date | string;
  /** Raw RFC headers when the call-site has them (EmailEngine/IMAP). Drives
   *  machine-sent detection (List-Unsubscribe, Precedence, Auto-Submitted).
   *  Optional + back-compat: absent ⇒ role-local-part detection only. */
  headers?: Record<string, string> | null;
  /** Raw text/calendar (.ics) part of an inbound meeting invite, when the
   *  transport exposes it — parsed for the inline event card (INBOX-R12/CAL). */
  calendar?: string | null;
  /** Attachment metadata for the reading pane (INBOX-R04). */
  attachments?: AttachmentMeta[];
}

export interface InboundCaptureResult {
  /** true → an activities row was inserted now. */
  captured: boolean;
  reason?: "duplicate" | "unresolved_sender" | "queued_for_review";
  activityId?: string;
  approvalId?: string;
  contactId?: string | null;
  companyId?: string | null;
  /** true → this capture auto-created the contact. */
  contactCreated?: boolean;
}

/**
 * Detect a reply to a tracked outbound sequence email (threadId match), flip
 * `repliedAt` and emit `email/reply-received` for the processReply handler.
 *
 * Idempotent: the FIRST caller to see the reply wins (repliedAt null-guard) —
 * the cron, force-sync and any future path can all call this without
 * double-firing processReply. The EmailEngine webhook keeps its own
 * reply-classification queue; its fallback also sets repliedAt, which this
 * guard respects.
 */
export async function detectSequenceReply(opts: {
  tenantId: string;
  threadId?: string | null;
  contactId?: string | null;
  replyBody?: string | null;
  replySubject?: string | null;
  replierEmail?: string | null;
}): Promise<boolean> {
  if (!opts.threadId || !opts.contactId) return false;

  const [outbound] = await db
    .select({
      id: outboundEmails.id,
      enrollmentId: outboundEmails.enrollmentId,
      contactId: outboundEmails.contactId,
      repliedAt: outboundEmails.repliedAt,
    })
    .from(outboundEmails)
    .where(
      and(
        eq(outboundEmails.threadId, opts.threadId),
        eq(outboundEmails.tenantId, opts.tenantId),
        eq(outboundEmails.status, "sent"),
      ),
    )
    .limit(1);

  if (!outbound?.enrollmentId || outbound.repliedAt) return false;

  await db
    .update(outboundEmails)
    .set({
      repliedAt: new Date(),
      replySnippet: (opts.replyBody || "").slice(0, 500),
    })
    .where(eq(outboundEmails.id, outbound.id));

  await inngest
    .send({
      name: "email/reply-received",
      data: {
        tenantId: opts.tenantId,
        enrollmentId: outbound.enrollmentId,
        contactId: outbound.contactId || opts.contactId,
        outboundEmailId: outbound.id,
        replyBody: (opts.replyBody || "").slice(0, 5000),
        replySubject: opts.replySubject || "",
        replierEmail: opts.replierEmail || "",
      },
    })
    .catch(console.warn);

  return true;
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

  // Classify the sender (human vs machine) up front: this is recorded on the
  // activity so the timeline stays complete, AND it gates auto-creation below
  // so a `noreply@`/newsletter sender never becomes a first-class lead-contact.
  const classification = classifyInboundSender({
    fromHeader: input.fromHeader || "",
    subject: input.subject,
    text: input.text,
    headers: input.headers,
  });

  // Idempotency: skip if this messageId is already captured for the tenant.
  // The batch pull paths historically keyed dedup on metadata.gmailMessageId,
  // so honour both keys — a message captured by one path must never be
  // re-inserted by another.
  if (messageId) {
    const [dup] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, tenantId),
          eq(activities.channel, "email"),
          sql`((${activities.metadata} ->> 'messageId') = ${messageId} OR (${activities.metadata} ->> 'gmailMessageId') = ${messageId})`,
        ),
      )
      .limit(1);
    if (dup) return { captured: false, reason: "duplicate", activityId: dup.id };
  }

  // Resolve the contact: explicit thread reply -> existing by sender -> create.
  let contact: { id: string; companyId: string | null } | null = null;
  let contactCreated = false;
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

  // Capture-completeness: a real person who emails you is the exact interaction
  // the product promises to capture, so a HUMAN inbound from an unknown sender
  // is captured by default — its contact auto-created — unless the tenant set
  // contactCreationMode "disabled". A business-domain sender is graphed under
  // their company (resolved or auto-created); a personal/free-mail sender
  // (gmail, outlook, …) becomes a company-less contact rather than fabricating
  // a "Gmail" account. The machine-sent gate is unchanged: an automated sender
  // is never promoted to a contact — it is attached to its company only when
  // that company is already known, otherwise left unresolved.
  let companyId: string | null = contact?.companyId ?? null;
  if (!contact && senderEmail) {
    // A "business" domain is one we'd graph as a company: present, and not a
    // personal/free-mail or do-not-track domain (those stay company-less).
    const isBusinessDomain = !!domain && !ignoredDomains.has(domain);

    let resolvedCompanyId: string | null = null;
    if (isBusinessDomain) {
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
      resolvedCompanyId = existingCo?.id ?? null;
    }

    const createContact =
      !classification.isMachineSent && settings.contactCreationMode !== "disabled";

    if (createContact) {
      // Business domain → ensure the company exists so the contact is graphed
      // under an account. Personal/free-mail → leave the contact company-less.
      if (isBusinessDomain && !resolvedCompanyId) {
        const base = domain.split(".")[0] || domain;
        const [newCo] = await db
          .insert(companies)
          .values({ tenantId, name: base.charAt(0).toUpperCase() + base.slice(1), domain })
          .returning({ id: companies.id });
        resolvedCompanyId = newCo.id;
        void inngest
          .send({ name: "company/created", data: { companyId: newCo.id, tenantId } })
          .catch(() => {});
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
      contactCreated = true;
      companyId = newContact.companyId;
      void inngest
        .send({
          name: "contact/created",
          // Tag the origin so the qualify handler runs the inbound relationship
          // gate (prospect vs vendor/recruiter) before any "Hot inbound"
          // notification — and so sourced/imported contacts never masquerade as
          // inbound. See _specs/inbound-lead-recognition/.
          data: { contactId: newContact.id, tenantId, source: "inbound_email" },
        })
        .catch(() => {});
    } else {
      // Machine-sent (or "disabled"): attach to the known company if any,
      // else this stays unresolved and is dropped below.
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
  const occurredAt = normalizeSyncDate(input.occurredAt);

  // Retain the sanitized HTML body so the reading pane can render real markup
  // (links / images / formatting) instead of flattened text (INBOX-R01/R13).
  // The server pre-strip removes executable/dangerous markup before it is ever
  // persisted; the pane re-sanitizes against a strict allowlist at render time.
  // Capped so a hostile or runaway body can't bloat the activity row.
  const bodyHtml = input.html ? stripDangerousHtml(input.html).slice(0, 500_000) : null;

  // Sender domain-authentication verdict (SPF/DKIM/DMARC) from the receiving
  // server's header — a stored trust signal for the reading pane (INBOX-R06).
  const senderAuth = parseAuthResults(input.headers);

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
        // Sanitized HTML body for the reading pane (INBOX-R01/R13). Only stored
        // when present, so text-only mail keeps a lean metadata row.
        ...(bodyHtml ? { bodyHtml } : {}),
        // Raw .ics of an inbound invite (INBOX-R12/CAL), capped. Only when present.
        ...(input.calendar ? { calendar: input.calendar.slice(0, 100_000) } : {}),
        // Attachment metadata (INBOX-R04), only when the mail had attachments.
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
        // Sender domain-auth verdict (INBOX-R06) — small, always stored so the
        // reader can tell "unknown" (checked, no verdict) from a real pass/fail.
        senderAuth,
        // The lead-recognition verdict travels with the activity so every
        // downstream reader (warm-leads, hot-inbounds, inbox lanes) can trust
        // a stored decision rather than re-deriving it. Deterministic-only in
        // tranche 1; the LLM relationship verdict (`isInboundLead`) lands in
        // tranche 2. See `_specs/inbound-lead-recognition/`.
        leadClassification: {
          senderType: classification.senderType,
          isMachineSent: classification.isMachineSent,
          isBulk: classification.isBulk,
          isRoleAddress: classification.isRoleAddress,
          reasons: classification.reasons,
          classifier: "deterministic-v1",
        },
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
    contactCreated,
  };
}
