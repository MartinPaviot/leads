/**
 * GET /api/dashboard/hot-inbounds
 *
 * Returns recent contacts who came in via the inbound webhook AND
 * qualified as `hot` priority. Surfaces them on the dashboard so the
 * founder can act within the "speed-to-lead" window (Monaco-equivalent
 * principle: a demo request acted on within 5 minutes converts ~9x
 * higher than one acted on within an hour).
 *
 * The query joins `notifications` (hot leads create a `new_contact`
 * notification with `Hot inbound lead:` prefix in `inngest/skill-events.ts`)
 * with `contacts` to get name/email/company. We deliberately query
 * notifications rather than re-classifying contacts on the fly:
 * `inngest/skill-events.ts` already encodes the "what counts as hot"
 * decision and persisting it via notification means the dashboard
 * shows exactly what the system flagged at the time, not a recomputed
 * answer that might drift if the qualification logic changes.
 *
 * Default window: 7 days. Cap: 20 cards.
 */

import { db } from "@/db";
import { notifications, contacts, companies } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { isExcludedAsLead } from "@/lib/inbound/lead-status";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // The notification title is the canonical "this is a hot inbound"
  // marker — see `inngest/skill-events.ts` which writes
  //   title: `Hot inbound lead: ${contactName}`
  // Filtering on the title prefix keeps us decoupled from any future
  // notification kind we might add for non-inbound hot signals.
  const rows = await db
    .select({
      notificationId: notifications.id,
      title: notifications.title,
      body: notifications.body,
      createdAt: notifications.createdAt,
      read: notifications.read,
      entityId: notifications.entityId,
      contactId: contacts.id,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email,
      contactTitle: contacts.title,
      contactScore: contacts.score,
      contactProperties: contacts.properties,
      companyId: companies.id,
      companyName: companies.name,
      companyDomain: companies.domain,
    })
    .from(notifications)
    .leftJoin(
      contacts,
      and(
        eq(contacts.id, notifications.entityId),
        eq(contacts.tenantId, authCtx.tenantId),
      ),
    )
    .leftJoin(
      companies,
      and(
        eq(companies.id, contacts.companyId),
        eq(companies.tenantId, authCtx.tenantId),
      ),
    )
    .where(
      and(
        eq(notifications.tenantId, authCtx.tenantId),
        eq(notifications.type, "new_contact"),
        sql`${notifications.title} like 'Hot inbound lead:%'`,
        gte(notifications.createdAt, since),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const items = rows
    // Hide contacts the user marked "not a lead" or the relationship classifier
    // ruled a vendor/recruiter (tranche 3 — see lib/inbound/lead-status.ts).
    .filter((r) => !isExcludedAsLead(r.contactProperties as Record<string, unknown> | null))
    .map((r) => {
    const props = (r.contactProperties as Record<string, unknown> | null) ?? {};
    return {
      notificationId: r.notificationId,
      contactId: r.contactId,
      name:
        [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ") ||
        r.contactEmail ||
        "Unknown",
      email: r.contactEmail,
      title: r.contactTitle,
      score: r.contactScore,
      companyId: r.companyId,
      companyName: r.companyName ?? (props.claimedCompanyName as string | undefined) ?? null,
      companyDomain: r.companyDomain,
      source: (props.inboundSource as string | undefined) ?? "demo_request",
      requiresManualMatch: Boolean(props.requiresManualMatch),
      submittedAt: (props.lastFormSubmissionAt as string | undefined) ?? r.createdAt,
      read: r.read,
    };
  });

  return Response.json({ items, since: since.toISOString() });
}
