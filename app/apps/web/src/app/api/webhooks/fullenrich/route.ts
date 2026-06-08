/**
 * POST /api/webhooks/fullenrich?token=<secret>
 *
 * Receiver for FullEnrich's async BULK enrichment callbacks. FullEnrich
 * POSTs a payload whose `data[]` rows each carry back the `custom`
 * object we sent (with `crm_contact_id`), so one webhook updates many
 * contacts. A mobile sets phoneType=mobile, which raises the contact's
 * call-queue accessibility.
 *
 * Security: the webhook URL carries a shared secret (FULLENRICH_WEBHOOK_SECRET)
 * we verify here, since FullEnrich's signature scheme isn't documented.
 * Correlation to contacts is by `custom.crm_contact_id`, not the URL.
 */

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseFullEnrichWebhook } from "@/lib/integrations/fullenrich-client";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const secret = process.env.FULLENRICH_WEBHOOK_SECRET;
  if (secret && token !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseFullEnrichWebhook(payload);
  let applied = 0;

  for (const c of parsed.contacts) {
    if (!c.contactId || (!c.phone && !c.email)) continue;

    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, c.contactId))
      .limit(1);
    if (!contact) continue;

    const props = (contact.properties ?? {}) as Record<string, unknown>;
    const prev = typeof props.enrichment_source === "string" ? props.enrichment_source : "";
    const source = prev.includes("fullenrich") ? prev : [prev, "fullenrich"].filter(Boolean).join("+");

    await db
      .update(contacts)
      .set({
        // Never overwrite a known-good number/email with nothing.
        phone: c.phone ?? contact.phone,
        email: contact.email ?? c.email,
        properties: {
          ...props,
          enrichment_source: source,
          ...(c.phoneType ? { phoneType: c.phoneType } : {}),
          ...(c.emailStatus ? { email_status: c.emailStatus } : {}),
          fullenrich_enriched_at: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, c.contactId));
    applied++;
  }

  return Response.json({ ok: true, applied, total: parsed.contacts.length });
}
