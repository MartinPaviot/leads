/**
 * GET /api/sequences/drafts/[id]/context
 *
 * P0-1 task 1.2 — context bundle for the approval UI's "Why this
 * draft?" panel.
 *
 * Returns the surrounding context the founder needs to decide
 * approve/reject :
 *   - contact (name, title, email)
 *   - account (name, domain, score, industry)
 *   - deal (id, name, stage, value) when a deal links to this contact
 *   - recentInteractions (last 5 emails/meetings/notes)
 *   - signalsAtTriggerTime (verbatim from `personalization_sources`)
 *
 * All reads are tenant-scoped. Returns 404 when the draft is missing
 * (or in another tenant).
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import {
  sequenceDrafts,
  contacts,
  companies,
  deals,
  activities,
} from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [draft] = await db
    .select()
    .from(sequenceDrafts)
    .where(
      and(
        eq(sequenceDrafts.id, id),
        eq(sequenceDrafts.tenantId, authCtx.tenantId),
      ),
    )
    .limit(1);

  if (!draft) {
    return Response.json({ error: "Draft not found" }, { status: 404 });
  }

  // Parallel fetches — contact + (company via contact.companyId) +
  // most-recent open deal for the company + last 5 activities for
  // the contact.
  const [contactRow] = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.id, draft.contactId),
        eq(contacts.tenantId, authCtx.tenantId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);

  let companyRow: typeof companies.$inferSelect | null = null;
  let dealRow: typeof deals.$inferSelect | null = null;

  if (contactRow?.companyId) {
    const [c] = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.id, contactRow.companyId),
          eq(companies.tenantId, authCtx.tenantId),
          isNull(companies.deletedAt),
        ),
      )
      .limit(1);
    companyRow = c ?? null;

    if (companyRow) {
      const [d] = await db
        .select()
        .from(deals)
        .where(
          and(
            eq(deals.tenantId, authCtx.tenantId),
            eq(deals.companyId, companyRow.id),
            isNull(deals.deletedAt),
          ),
        )
        .orderBy(desc(deals.updatedAt))
        .limit(1);
      dealRow = d ?? null;
    }
  }

  const recentActivities = await db
    .select({
      id: activities.id,
      activityType: activities.activityType,
      channel: activities.channel,
      direction: activities.direction,
      occurredAt: activities.occurredAt,
      summary: activities.summary,
      sentiment: activities.sentiment,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, authCtx.tenantId),
        eq(activities.entityType, "contact"),
        eq(activities.entityId, draft.contactId),
        isNull(activities.deletedAt),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(5);

  return Response.json({
    draft: {
      id: draft.id,
      status: draft.status,
      triggerReason: draft.triggerReason,
      generatedAt: draft.generatedAt?.toISOString(),
    },
    contact: contactRow
      ? {
          id: contactRow.id,
          firstName: contactRow.firstName,
          lastName: contactRow.lastName,
          email: contactRow.email,
          title: contactRow.title,
          score: contactRow.score,
        }
      : null,
    account: companyRow
      ? {
          id: companyRow.id,
          name: companyRow.name,
          domain: companyRow.domain,
          score: companyRow.score,
        }
      : null,
    deal: dealRow
      ? {
          id: dealRow.id,
          name: dealRow.name,
          stage: dealRow.stage,
          value: dealRow.value,
        }
      : null,
    recentInteractions: recentActivities.map((a) => ({
      id: a.id,
      type: a.activityType,
      channel: a.channel,
      direction: a.direction,
      occurredAt: a.occurredAt?.toISOString(),
      summary: a.summary,
      sentiment: a.sentiment,
    })),
    signalsAtTriggerTime: draft.personalizationSources,
  });
}
