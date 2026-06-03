/**
 * POST /api/webhooks/zeliq?contactId=<id>&token=<secret>
 *
 * Receiver for Zeliq's async enrichment callbacks. Zeliq POSTs the
 * enriched email/phone here after processing a /enrich request whose
 * callback_url pointed at this route (see lib/integrations/zeliq-client).
 * Applies the result to the contact — a mobile sets phoneType=mobile,
 * which raises the contact's call-queue accessibility.
 *
 * Security: the callback URL carries a shared secret (ZELIQ_WEBHOOK_SECRET)
 * that we verify here, since Zeliq's signature scheme isn't documented.
 */

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseZeliqWebhook } from "@/lib/integrations/zeliq-client";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const contactId = url.searchParams.get("contactId");
  const token = url.searchParams.get("token");

  const secret = process.env.ZELIQ_WEBHOOK_SECRET;
  if (secret && token !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!contactId) {
    return Response.json({ error: "Missing contactId" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseZeliqWebhook(payload);
  if (!parsed.phone && !parsed.email) {
    // Zeliq found nothing (or a shape we couldn't read) — ack so it
    // doesn't retry, but don't touch the contact.
    return Response.json({ ok: true, applied: false });
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact) {
    return Response.json({ error: "Contact not found" }, { status: 404 });
  }

  const props = (contact.properties ?? {}) as Record<string, unknown>;
  const prev = typeof props.enrichment_source === "string" ? props.enrichment_source : "";
  const source = prev.includes("zeliq") ? prev : [prev, "zeliq"].filter(Boolean).join("+");

  await db
    .update(contacts)
    .set({
      // Don't overwrite a known-good number/email with nothing.
      phone: parsed.phone ?? contact.phone,
      email: contact.email ?? parsed.email,
      properties: {
        ...props,
        enrichment_source: source,
        ...(parsed.phoneType ? { phoneType: parsed.phoneType } : {}),
        ...(parsed.emailStatus ? { email_status: parsed.emailStatus } : {}),
        zeliq_enriched_at: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contactId));

  return Response.json({ ok: true, applied: true });
}
