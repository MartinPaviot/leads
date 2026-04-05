import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { contacts, companies, activities } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get top contacts by composite engagement
  const topContacts = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      email: contacts.email,
      score: contacts.score,
      companyName: companies.name,
      companyDomain: companies.domain,
      emailCount: sql<number>`count(CASE WHEN ${activities.activityType} IN ('email_received', 'email_sent') THEN 1 END)`,
      meetingCount: sql<number>`count(CASE WHEN ${activities.activityType} IN ('meeting_scheduled', 'meeting_completed') THEN 1 END)`,
      lastActivityDate: sql<Date>`max(${activities.occurredAt})`,
      positiveCount: sql<number>`count(CASE WHEN ${activities.sentiment} = 'positive' THEN 1 END)`,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .innerJoin(activities, and(
      eq(activities.entityId, contacts.id),
      eq(activities.entityType, "contact"),
      sql`${activities.occurredAt} > ${thirtyDaysAgo.toISOString()}::timestamp`,
    ))
    .where(eq(contacts.tenantId, authCtx.tenantId))
    .groupBy(contacts.id, contacts.firstName, contacts.lastName, contacts.title, contacts.email, contacts.score, companies.name, companies.domain)
    .orderBy(desc(sql`
      count(CASE WHEN ${activities.activityType} IN ('email_received', 'email_sent') THEN 1 END) * 3 +
      count(CASE WHEN ${activities.activityType} IN ('meeting_scheduled', 'meeting_completed') THEN 1 END) * 5 +
      count(CASE WHEN ${activities.sentiment} = 'positive' THEN 1 END) * 4
    `))
    .limit(10);

  const priorities = topContacts.map((c) => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
    const emails = c.emailCount || 0;
    const meetings = c.meetingCount || 0;
    const positives = c.positiveCount || 0;

    let topReason = "";
    if (positives > 0) topReason = `${positives} positive interaction${positives > 1 ? "s" : ""}`;
    else if (meetings > 0) topReason = `${meetings} meeting${meetings > 1 ? "s" : ""} scheduled`;
    else if (emails > 3) topReason = `Active conversation (${emails} emails)`;
    else topReason = `${emails} email${emails > 1 ? "s" : ""} exchanged`;

    return {
      contactId: c.contactId,
      name,
      title: c.title,
      email: c.email,
      company: c.companyName,
      companyDomain: c.companyDomain,
      score: c.score,
      emailCount: emails,
      meetingCount: meetings,
      lastActivityDate: c.lastActivityDate,
      topReason,
    };
  });

  return NextResponse.json({ priorities });
}
