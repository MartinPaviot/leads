/**
 * POST /api/contacts/fullenrich-enrich   { contactIds: string[] }
 *
 * Deep, async mobile + email enrichment via FullEnrich (15+ EU sources).
 * Fires ONE bulk request (up to 100 contacts) with a callback pointing at
 * /api/webhooks/fullenrich; contacts update as FullEnrich posts results
 * back. Use this when the synchronous Apollo->Kaspr->Lusha waterfall
 * missed a mobile (FullEnrich is the deeper, EU-strong pass).
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  isFullEnrichAvailable,
  requestFullEnrichBulk,
  fullEnrichWebhookUrl,
  type FullEnrichItem,
} from "@/lib/integrations/fullenrich-client";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFullEnrichAvailable()) {
    return Response.json({ error: "FullEnrich not configured (set FULLENRICH_API_KEY)" }, { status: 503 });
  }

  let body: { contactIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const contactIds = Array.isArray(body.contactIds)
    ? (body.contactIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 100)
    : [];
  if (contactIds.length === 0) {
    return Response.json({ error: "contactIds array required" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, authCtx.tenantId), inArray(contacts.id, contactIds)));
  if (rows.length === 0) return Response.json({ error: "No contacts found" }, { status: 404 });

  // Resolve company name/domain per contact — improves FullEnrich's match.
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
  const companyById = new Map<string, { name: string | null; domain: string | null }>();
  if (companyIds.length > 0) {
    const comps = await db
      .select({ id: companies.id, name: companies.name, domain: companies.domain })
      .from(companies)
      .where(and(eq(companies.tenantId, authCtx.tenantId), inArray(companies.id, companyIds)));
    for (const c of comps) companyById.set(c.id, { name: c.name, domain: c.domain });
  }

  const items: FullEnrichItem[] = rows
    .map((r): FullEnrichItem => {
      const comp = r.companyId ? companyById.get(r.companyId) : undefined;
      const domain = comp?.domain ?? (r.email ? r.email.split("@")[1] : undefined);
      return {
        contactId: r.id,
        firstName: r.firstName ?? undefined,
        lastName: r.lastName ?? undefined,
        linkedinUrl: r.linkedinUrl ?? undefined,
        domain: domain ?? undefined,
        companyName: comp?.name ?? undefined,
      };
    })
    // FullEnrich needs first+last + a company (domain or name), OR a LinkedIn URL.
    .filter((it) => (it.firstName && it.lastName && (it.domain || it.companyName)) || it.linkedinUrl);

  if (items.length === 0) {
    return Response.json(
      { error: "No contacts have enough identity (need first + last + company, or a LinkedIn URL)" },
      { status: 422 },
    );
  }

  const baseUrl = process.env.FULLENRICH_CALLBACK_BASE_URL ?? new URL(req.url).origin;
  const webhookUrl = fullEnrichWebhookUrl(baseUrl);

  try {
    const { id } = await requestFullEnrichBulk({
      items,
      webhookUrl,
      name: `Elevay ${authCtx.tenantId.slice(0, 8)} ${new Date().toISOString().slice(0, 10)}`,
    });
    return Response.json({
      ok: true,
      async: true,
      enrichmentId: id,
      requested: items.length,
      skipped: rows.length - items.length,
      note: "FullEnrich posts results to /api/webhooks/fullenrich; contacts update when they arrive.",
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "FullEnrich request failed" }, { status: 502 });
  }
}
