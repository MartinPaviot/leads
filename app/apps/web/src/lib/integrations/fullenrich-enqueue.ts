/**
 * Shared FullEnrich enqueue path — resolve tenant contacts into FullEnrich
 * items and fire ONE async bulk request. Used by both the HTTP route
 * (`/api/contacts/fullenrich-enrich`, the Contacts "Find mobile" action)
 * and the chat tool (`findContactMobile`) so the identity-building and
 * eligibility rules live in exactly one place.
 *
 * Async by nature: results arrive later on the FullEnrich webhook
 * (`/api/webhooks/fullenrich`) and update each contact in place.
 */

import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  isFullEnrichAvailable,
  requestFullEnrichBulk,
  fullEnrichWebhookUrl,
  type FullEnrichItem,
} from "@/lib/integrations/fullenrich-client";

export type FullEnrichEnqueueResult =
  | { ok: true; enrichmentId: string | null; requested: number; skipped: number }
  | {
      ok: false;
      code: "not_configured" | "no_contacts" | "no_identity" | "request_failed";
      error: string;
    };

/**
 * Fire a FullEnrich bulk enrichment for the given tenant-scoped contact
 * ids (capped at 100). `baseUrl` is the absolute origin FullEnrich posts
 * its webhook back to.
 */
export async function enqueueFullEnrichForContacts(params: {
  tenantId: string;
  contactIds: string[];
  baseUrl: string;
}): Promise<FullEnrichEnqueueResult> {
  const { tenantId, baseUrl } = params;
  const contactIds = params.contactIds
    .filter((x): x is string => typeof x === "string")
    .slice(0, 100);

  if (!isFullEnrichAvailable()) {
    return { ok: false, code: "not_configured", error: "FullEnrich not configured (set FULLENRICH_API_KEY)" };
  }
  if (contactIds.length === 0) {
    return { ok: false, code: "no_contacts", error: "No contact ids provided" };
  }

  const rows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, contactIds)));
  if (rows.length === 0) {
    return { ok: false, code: "no_contacts", error: "No matching contacts found" };
  }

  // Resolve company name/domain per contact — sharpens FullEnrich's match.
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
  const companyById = new Map<string, { name: string | null; domain: string | null }>();
  if (companyIds.length > 0) {
    const comps = await db
      .select({ id: companies.id, name: companies.name, domain: companies.domain })
      .from(companies)
      .where(and(eq(companies.tenantId, tenantId), inArray(companies.id, companyIds)));
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
    return {
      ok: false,
      code: "no_identity",
      error: "No contacts have enough identity (need first + last + company, or a LinkedIn URL)",
    };
  }

  const webhookUrl = fullEnrichWebhookUrl(baseUrl);
  try {
    const { id } = await requestFullEnrichBulk({
      items,
      webhookUrl,
      name: `Elevay ${tenantId.slice(0, 8)} ${new Date().toISOString().slice(0, 10)}`,
    });
    return { ok: true, enrichmentId: id, requested: items.length, skipped: rows.length - items.length };
  } catch (e) {
    return { ok: false, code: "request_failed", error: e instanceof Error ? e.message : "FullEnrich request failed" };
  }
}
