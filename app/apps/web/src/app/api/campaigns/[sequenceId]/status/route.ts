import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequences, sequenceEnrollments, contacts, companies, outboundEmails } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sequenceId: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sequenceId } = await params;

  const [sequence] = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.id, sequenceId), eq(sequences.tenantId, authCtx.tenantId)))
    .limit(1);

  if (!sequence) {
    return Response.json({ error: "Sequence not found" }, { status: 404 });
  }

  const config = (sequence.campaignConfig || { status: "idle" }) as any;

  // If ready or launched, also return contact preview
  let contactPreview: any[] = [];
  if (config.status === "ready" || config.status === "launched") {
    const enrolled = await db
      .select({
        contactId: sequenceEnrollments.contactId,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        title: contacts.title,
        score: contacts.score,
        companyName: companies.name,
        companyDomain: companies.domain,
      })
      .from(sequenceEnrollments)
      .innerJoin(contacts, eq(sequenceEnrollments.contactId, contacts.id))
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(eq(sequenceEnrollments.sequenceId, sequenceId))
      .orderBy(sql`${contacts.score} DESC NULLS LAST`)
      .limit(50);

    contactPreview = enrolled;
  }

  // Email stats
  let emailStats = { draft: 0, queued: 0, sent: 0, opened: 0, replied: 0, total: 0 };
  if (config.status === "ready" || config.status === "launched") {
    const counts = await db
      .select({
        status: outboundEmails.status,
        count: sql<number>`count(*)`,
      })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.tenantId, authCtx.tenantId),
          eq(outboundEmails.campaignId, sequenceId)
        )
      )
      .groupBy(outboundEmails.status);

    for (const row of counts) {
      const c = Number(row.count);
      emailStats.total += c;
      if (row.status === "draft") emailStats.draft = c;
      if (row.status === "queued") emailStats.queued = c;
      if (row.status === "sent" || row.status === "delivered") emailStats.sent += c;
    }

    // Engagement counts so the launched Opened/Replied tiles aren't structurally
    // zero (the status breakdown above never produced them).
    const [engagement] = await db
      .select({
        opened: sql<number>`count(*) filter (where ${outboundEmails.openedAt} is not null)`,
        replied: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is not null)`,
      })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.tenantId, authCtx.tenantId),
          eq(outboundEmails.campaignId, sequenceId)
        )
      );
    emailStats.opened = Number(engagement?.opened ?? 0);
    emailStats.replied = Number(engagement?.replied ?? 0);
  }

  return Response.json({
    status: config.status,
    stats: config.stats || null,
    emailStats,
    contactPreview,
  });
}
