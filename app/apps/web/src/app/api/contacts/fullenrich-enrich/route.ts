/**
 * POST /api/contacts/fullenrich-enrich   { contactIds: string[] }
 *
 * Deep, async mobile + email enrichment via FullEnrich (15+ EU sources).
 * Fires ONE bulk request (up to 100 contacts) with a callback pointing at
 * /api/webhooks/fullenrich; contacts update as FullEnrich posts results
 * back. Use this when the synchronous Apollo->Kaspr->Lusha waterfall
 * missed a mobile (FullEnrich is the deeper, EU-strong pass).
 *
 * The identity-building + eligibility logic is shared with the chat
 * tool `findContactMobile` via enqueueFullEnrichForContacts().
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { enqueueFullEnrichForContacts } from "@/lib/integrations/fullenrich-enqueue";

const STATUS_BY_CODE: Record<string, number> = {
  not_configured: 503,
  no_contacts: 400,
  no_identity: 422,
  request_failed: 502,
};

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { contactIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const contactIds = Array.isArray(body.contactIds)
    ? (body.contactIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const baseUrl = process.env.FULLENRICH_CALLBACK_BASE_URL ?? new URL(req.url).origin;
  const result = await enqueueFullEnrichForContacts({
    tenantId: authCtx.tenantId,
    contactIds,
    baseUrl,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: STATUS_BY_CODE[result.code] ?? 400 });
  }

  return Response.json({
    ok: true,
    async: true,
    enrichmentId: result.enrichmentId,
    requested: result.requested,
    skipped: result.skipped,
    note: "FullEnrich posts results to /api/webhooks/fullenrich; contacts update when they arrive.",
  });
}
