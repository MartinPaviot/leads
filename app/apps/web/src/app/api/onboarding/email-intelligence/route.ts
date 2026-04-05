import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { contacts, companies, activities } from "@/db/schema";
import { eq, and, sql, isNotNull } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Count contacts discovered from email sync
  const [contactCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(eq(contacts.tenantId, authCtx.tenantId));

  // Count companies with contacts (active conversations proxy)
  const [conversationCount] = await db
    .select({ count: sql<number>`count(distinct ${contacts.companyId})` })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, authCtx.tenantId),
        isNotNull(contacts.companyId)
      )
    );

  // Count warm matches: TAM companies where we have email-synced contacts
  const [warmResult] = await db
    .select({ count: sql<number>`count(DISTINCT ${companies.id})` })
    .from(companies)
    .innerJoin(contacts, eq(contacts.companyId, companies.id))
    .where(
      and(
        eq(companies.tenantId, authCtx.tenantId),
        sql`${companies.properties}->>'source' = 'tam'`,
        sql`${contacts.properties}->>'source' = 'email_sync'`
      )
    );
  const warmMatches = warmResult?.count || 0;

  // Count follow-ups needed: contacts with last activity > 7 days ago
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [followUpResult] = await db
    .select({ count: sql<number>`count(DISTINCT ${contacts.id})` })
    .from(contacts)
    .innerJoin(activities, and(
      eq(activities.entityId, contacts.id),
      eq(activities.entityType, "contact"),
    ))
    .where(
      and(
        eq(contacts.tenantId, authCtx.tenantId),
        sql`${contacts.properties}->>'auto_created' = 'true'`,
        sql`${activities.occurredAt} < ${sevenDaysAgo.toISOString()}::timestamp`,
      )
    );
  const followUps = followUpResult?.count || 0;

  return NextResponse.json({
    contacts: Number(contactCount?.count || 0),
    conversations: Number(conversationCount?.count || 0),
    icpMatches: warmMatches,
    followUps,
  });
}
