/**
 * Inbound demo-form webhook.
 *
 * Public POST surface that marketing forms (HubSpot Forms, Webflow,
 * Typeform, custom JS embeds) call when a visitor submits "Request a
 * demo" or any high-intent CTA. We do NOT do enrichment or scoring
 * synchronously — that's the existing `contact/created` Inngest
 * pipeline (`inngest/skill-events.ts:onContactCreatedEnrichAndQualify`).
 * Our job is exactly four things, in order:
 *   1. Authenticate the request (HMAC over raw body, fail-closed).
 *   2. Idempotency: dedupe replays on `formProviderEventId`.
 *   3. Validate + create/upsert contact (and company when the email
 *      domain isn't a known free provider).
 *   4. Emit `contact/created` so the existing enrich+qualify+notify
 *      pipeline takes over.
 *
 * Free-email submissions (gmail/outlook/etc) are still recorded but
 * tagged `requiresManualMatch=true` so the dashboard can route them
 * to a separate review queue. We do NOT attempt to invent a company
 * from a personal email — that would pollute the TAM.
 *
 * Security: HMAC SHA-256 over the raw body matches the convention used
 * by the Resend webhook handler (`webhooks/resend/route.ts`). Replay
 * window is 5 minutes — same as Resend. No request authentication =
 * 401, no exceptions, no env-skipping.
 */

import { db } from "@/db";
import { contacts, companies, activities } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";
import { inngest } from "@/inngest/client";
import { isFreeEmailDomain } from "@/lib/email/is-free-provider";
import { logger } from "@/lib/observability/logger";
import { z } from "zod";

const inboundPayloadSchema = z.object({
  /** Tenant the form is registered to. The HMAC binds the request to
   *  this tenant — a forged tenantId without a matching signature is
   *  rejected at signature verification. */
  tenantId: z.string().min(1),
  /** Provider-supplied unique event id used for replay dedupe. The
   *  form provider MUST guarantee uniqueness across retries. We accept
   *  anything 8-200 chars — most providers use UUIDs. */
  formProviderEventId: z.string().min(8).max(200),
  /** "demo_request" | "trial" | "newsletter" | "contact_form" | etc.
   *  Free string so callers can use whatever taxonomy they wish; the
   *  qualification skill knows about the canonical ones. */
  source: z.string().min(1).max(64).default("demo_request"),
  email: z.string().email(),
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  /** Optional company-name claim. The email domain is authoritative
   *  for matching; if the claim disagrees we surface both rather than
   *  picking. */
  companyName: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  /** Free-form properties forwarded to the contact's `properties`
   *  jsonb. Useful for capturing UTM, page, message body, etc. */
  metadata: z.record(z.unknown()).optional(),
});

type InboundPayload = z.infer<typeof inboundPayloadSchema>;

/**
 * Verify the request signature. Header `x-elevay-signature` carries
 * a single `v1,<base64>` value computed as
 *   HMAC-SHA256(secret, `${timestamp}.${rawBody}`).
 * The timestamp comes from `x-elevay-timestamp` (UNIX seconds) and
 * must be within 5 minutes of now to bound replay.
 *
 * Fail-closed: missing `INBOUND_WEBHOOK_SECRET` env → reject
 * everything. We do NOT default to "open in dev" because a leak of
 * the dev URL would let anyone pollute the test TAM.
 */
function verifyInboundSignature(req: Request, rawBody: string): boolean {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return false;

  const ts = req.headers.get("x-elevay-timestamp");
  const sigHeader = req.headers.get("x-elevay-signature");
  if (!ts || !sigHeader) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    return false;
  }

  const v1 = sigHeader.split(",", 2);
  if (v1.length !== 2 || v1[0] !== "v1") return false;
  const provided = v1[1];

  const expected = createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest("base64");

  // timing-safe comparison of equal-length buffers
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Look up an existing contact by tenant + email. If found, returns it
 * along with `lastFormSubmissionEventId` from properties for replay
 * dedupe. If not, returns null.
 */
async function findContactByEmail(tenantId: string, email: string) {
  const [row] = await db
    .select({
      id: contacts.id,
      companyId: contacts.companyId,
      properties: contacts.properties,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        eq(contacts.email, email.toLowerCase()),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function upsertCompanyForDomain(
  tenantId: string,
  domain: string,
  claimedName: string | undefined,
): Promise<string> {
  const normDomain = domain.toLowerCase();
  const [existing] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), eq(companies.domain, normDomain)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(companies)
    .values({
      tenantId,
      name: claimedName ?? normDomain,
      domain: normDomain,
    })
    .returning({ id: companies.id });
  return created.id;
}

export async function POST(req: Request) {
  // We need the raw body for signature verification — `await req.json()`
  // would consume the stream. Read once, parse twice.
  const rawBody = await req.text();

  if (!verifyInboundSignature(req, rawBody)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: InboundPayload;
  try {
    parsed = inboundPayloadSchema.parse(JSON.parse(rawBody));
  } catch (err) {
    return Response.json(
      {
        error: "Invalid payload",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  const {
    tenantId,
    formProviderEventId,
    source,
    email,
    firstName,
    lastName,
    companyName,
    title,
    metadata = {},
  } = parsed;
  const emailLower = email.toLowerCase();

  // ── Idempotency check ─────────────────────────────────────
  // We dedupe on (tenantId, formProviderEventId). The simplest
  // durable check: store the last seen id on the contact's
  // `properties.lastFormSubmissionEventId`. If it matches, we 200
  // OK without re-emitting `contact/created` — replays from the
  // form provider become no-ops.
  const existingContact = await findContactByEmail(tenantId, emailLower);
  if (existingContact) {
    const lastId = (existingContact.properties as Record<string, unknown> | null)
      ?.lastFormSubmissionEventId;
    if (lastId === formProviderEventId) {
      return Response.json({ ok: true, deduped: true, contactId: existingContact.id });
    }
  }

  const isFree = isFreeEmailDomain(emailLower);

  // ── Resolve company ────────────────────────────────────────
  // Only resolve a company when the email domain is *not* a free
  // provider. Personal emails get `companyId = null` plus a flag so
  // the founder can review and decide whether to manually match
  // (e.g. they know `jane@gmail.com` is actually from `acme.com`).
  let companyId: string | null = existingContact?.companyId ?? null;
  if (!isFree && !companyId) {
    const at = emailLower.lastIndexOf("@");
    const domain = at > -1 ? emailLower.slice(at + 1) : null;
    if (domain) {
      try {
        companyId = await upsertCompanyForDomain(tenantId, domain, companyName);
      } catch (err) {
        logger.warn("inbound-webhook: company upsert failed", {
          tenantId,
          domain,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ── Create or update the contact ───────────────────────────
  // Properties carry the audit trail: source, last event id, when,
  // and any metadata the form passed through. We deliberately keep
  // the legacy `properties` jsonb as the system of record (no new
  // columns) so this endpoint can ship without a migration.
  const baseProperties: Record<string, unknown> = {
    ...(existingContact?.properties as Record<string, unknown> | null ?? {}),
    inboundSource: source,
    lastFormSubmissionEventId: formProviderEventId,
    lastFormSubmissionAt: new Date().toISOString(),
    requiresManualMatch: isFree,
    ...(companyName ? { claimedCompanyName: companyName } : {}),
    ...(metadata && typeof metadata === "object" ? { formMetadata: metadata } : {}),
  };

  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
    await db
      .update(contacts)
      .set({
        properties: baseProperties,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(title ? { title } : {}),
        ...(companyId && !existingContact.companyId ? { companyId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existingContact.id));
  } else {
    const [created] = await db
      .insert(contacts)
      .values({
        tenantId,
        email: emailLower,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        title: title ?? null,
        companyId,
        properties: baseProperties,
      })
      .returning({ id: contacts.id });
    contactId = created.id;
  }

  // ── Activity row for audit / timeline ─────────────────────
  // Keeps the form submission visible in the contact's activity
  // timeline alongside emails/meetings/notes. metadata.formProviderEventId
  // doubles as the dedupe key for analytics replay.
  try {
    await db.insert(activities).values({
      tenantId,
      actorType: "contact",
      actorId: contactId,
      entityType: "contact",
      entityId: contactId,
      activityType: "form_submitted" as const,
      channel: "web" as const,
      direction: "inbound" as const,
      summary: `Inbound ${source} via form`,
      metadata: {
        source,
        formProviderEventId,
        requiresManualMatch: isFree,
        ...metadata,
      },
    });
  } catch (err) {
    logger.warn("inbound-webhook: activity log failed (non-blocking)", {
      tenantId,
      contactId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Trigger the existing enrich+qualify+notify pipeline ────
  // We emit `contact/created` for both new and returning contacts.
  // Rationale: the existing `onContactCreatedEnrichAndQualify`
  // function is idempotent — Apollo enrichment is a no-op for
  // already-enriched contacts (same provider id), and re-running
  // qualification with fresh `source` is the correct behaviour for
  // a returning lead (a second demo request 30 days later IS news
  // worth re-notifying on). The dedupe at the webhook level
  // (formProviderEventId) already protects against pure replays.
  try {
    await inngest.send({
      name: "contact/created",
      data: { contactId, tenantId, source },
    });
  } catch (err) {
    logger.error("inbound-webhook: failed to emit inngest event", {
      tenantId,
      contactId,
      err: err instanceof Error ? err.message : String(err),
    });
    // Don't 500 the webhook — the contact is persisted, the founder
    // will see it. Form provider retries on 5xx and we'd double-write.
  }

  return Response.json({
    ok: true,
    contactId,
    companyId,
    requiresManualMatch: isFree,
    deduped: false,
  });
}
