/**
 * POST /api/contacts/[id]/zeliq-enrich
 *
 * Deep contact enrichment via Zeliq (40+ EU/FR sources, async). Fires
 * Zeliq's email + phone enrichment with a callback pointing at
 * /api/webhooks/zeliq; the contact updates when Zeliq posts back. Use
 * this when the synchronous Apollo→Kaspr→Lusha waterfall missed a mobile.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  isZeliqAvailable,
  requestZeliqEmail,
  requestZeliqPhone,
  zeliqCallbackUrl,
} from "@/lib/integrations/zeliq-client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isZeliqAvailable()) {
    return Response.json({ error: "Zeliq not configured (set ZELIQ_API_KEY)" }, { status: 503 });
  }
  const { id } = await params;

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)))
    .limit(1);
  if (!contact) return Response.json({ error: "Contact not found" }, { status: 404 });

  // Company name/domain helps Zeliq's email match.
  let company: string | undefined;
  if (contact.companyId) {
    const [c] = await db
      .select({ name: companies.name, domain: companies.domain })
      .from(companies)
      .where(eq(companies.id, contact.companyId))
      .limit(1);
    company = c?.domain ?? c?.name ?? undefined;
  }
  if (!company && contact.email) company = contact.email.split("@")[1];

  const baseUrl = process.env.ZELIQ_CALLBACK_BASE_URL ?? new URL(req.url).origin;
  const callbackUrl = zeliqCallbackUrl(baseUrl, id);
  const linkedinUrl = contact.linkedinUrl ?? undefined;

  const results: Record<string, string> = {};
  try {
    await requestZeliqPhone({ linkedinUrl, email: contact.email ?? undefined, callbackUrl });
    results.phone = "requested";
  } catch (e) {
    results.phone = e instanceof Error ? e.message : "failed";
  }
  try {
    await requestZeliqEmail({
      firstName: contact.firstName ?? undefined,
      lastName: contact.lastName ?? undefined,
      company,
      linkedinUrl,
      callbackUrl,
    });
    results.email = "requested";
  } catch (e) {
    results.email = e instanceof Error ? e.message : "failed";
  }

  return Response.json({
    ok: true,
    async: true,
    results,
    note: "Zeliq posts results to /api/webhooks/zeliq; the contact updates when they arrive.",
  });
}
