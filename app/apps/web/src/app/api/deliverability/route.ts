import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails, sequenceEnrollments, connectedMailboxes, sequences } from "@/db/schema";
import { eq, and, sql, isNotNull, count } from "drizzle-orm";

async function handleDeliverability(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Parse optional filters from query params
    const url = new URL(req.url, "http://localhost");
    const sequenceId = url.searchParams.get("sequenceId");

    // Build where clause. We gate on contact_id IS NOT NULL to drop self-test /
    // plumbing sends (the outbound-loop test email has no contact) that would
    // otherwise inflate "sent" and skew every rate. NOTE: unlike the prospect
    // KPIs (summary / rollups), we deliberately do NOT exclude excluded-as-lead
    // contacts here — deliverability is a SENDING-REPUTATION metric, and a real
    // send to a not-a-lead address that bounces/opens is still a genuine signal.
    // Also: we keep counting by sentAt (not status='sent'), because a bounced
    // row WAS dispatched and must stay in the bounce-rate denominator.
    const baseWhere = sequenceId
      ? and(eq(outboundEmails.tenantId, authCtx.tenantId), eq(outboundEmails.enrollmentId, sequenceId), isNotNull(outboundEmails.contactId))
      : and(eq(outboundEmails.tenantId, authCtx.tenantId), isNotNull(outboundEmails.contactId));

    // Aggregate metrics from outboundEmails in a single query
    const [metrics] = await db
      .select({
        totalSent: count(),
        totalOpened: sql<number>`count(*) filter (where ${outboundEmails.openedAt} is not null)`,
        totalReplied: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is not null)`,
        totalBounced: sql<number>`count(*) filter (where ${outboundEmails.status} = 'bounced')`,
        totalDelivered: sql<number>`count(*) filter (where ${outboundEmails.deliveredAt} is not null)`,
        totalClicked: sql<number>`count(*) filter (where ${outboundEmails.clickedAt} is not null)`,
      })
      .from(outboundEmails)
      .where(and(baseWhere, isNotNull(outboundEmails.sentAt)));

    const totalSent = Number(metrics?.totalSent || 0);
    const totalOpened = Number(metrics?.totalOpened || 0);
    const totalReplied = Number(metrics?.totalReplied || 0);
    const totalBounced = Number(metrics?.totalBounced || 0);
    const totalDelivered = Number(metrics?.totalDelivered || 0);
    const totalClicked = Number(metrics?.totalClicked || 0);

    // Rates
    const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
    const replyRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0;
    const bounceRate = totalSent > 0 ? Math.round((totalBounced / totalSent) * 100) : 0;
    const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

    // Spam rate from bounced with complaint type
    const [spamMetrics] = await db
      .select({ spamCount: count() })
      .from(outboundEmails)
      .where(and(baseWhere, eq(outboundEmails.bounceType, "complaint")));
    const spamCount = Number(spamMetrics?.spamCount || 0);
    const spamRate = totalSent > 0 ? Math.round((spamCount / totalSent) * 10000) / 100 : 0;

    // Per-step metrics (only when filtering by sequence)
    let stepMetrics: Array<{
      stepNumber: number;
      sent: number;
      opened: number;
      replied: number;
      bounced: number;
      clicked: number;
      openRate: number;
      replyRate: number;
    }> = [];

    if (sequenceId) {
      const steps = await db
        .select({
          stepNumber: outboundEmails.stepNumber,
          sent: count(),
          opened: sql<number>`count(*) filter (where ${outboundEmails.openedAt} is not null)`,
          replied: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is not null)`,
          bounced: sql<number>`count(*) filter (where ${outboundEmails.status} = 'bounced')`,
          clicked: sql<number>`count(*) filter (where ${outboundEmails.clickedAt} is not null)`,
        })
        .from(outboundEmails)
        .where(and(baseWhere, isNotNull(outboundEmails.sentAt)))
        .groupBy(outboundEmails.stepNumber)
        .orderBy(outboundEmails.stepNumber);

      stepMetrics = steps.map((s) => {
        const stepSent = Number(s.sent);
        return {
          stepNumber: s.stepNumber || 0,
          sent: stepSent,
          opened: Number(s.opened),
          replied: Number(s.replied),
          bounced: Number(s.bounced),
          clicked: Number(s.clicked),
          openRate: stepSent > 0 ? Math.round((Number(s.opened) / stepSent) * 100) : 0,
          replyRate: stepSent > 0 ? Math.round((Number(s.replied) / stepSent) * 100) : 0,
        };
      });
    }

    // Enrollment status breakdown
    const enrollmentRows = sequenceId
      ? await db.select({ status: sequenceEnrollments.status }).from(sequenceEnrollments).where(eq(sequenceEnrollments.sequenceId, sequenceId))
      : await db.select({ status: sequenceEnrollments.status }).from(sequenceEnrollments);

    const enrollmentsByStatus: Record<string, number> = {};
    for (const e of enrollmentRows) {
      const status = e.status || "unknown";
      enrollmentsByStatus[status] = (enrollmentsByStatus[status] || 0) + 1;
    }

    // Per-mailbox health (tenant-wide)
    const mailboxHealth = await db
      .select({
        id: connectedMailboxes.id,
        emailAddress: connectedMailboxes.emailAddress,
        status: connectedMailboxes.status,
        healthScore: connectedMailboxes.healthScore,
        sentToday: connectedMailboxes.sentToday,
        dailyLimit: connectedMailboxes.dailyLimit,
        bounceCount7d: connectedMailboxes.bounceCount7d,
      })
      .from(connectedMailboxes)
      .where(eq(connectedMailboxes.tenantId, authCtx.tenantId));

    // Week-over-week comparison: emails sent 7-14 days ago
    const prevWeekStart = new Date();
    prevWeekStart.setDate(prevWeekStart.getDate() - 14);
    const prevWeekEnd = new Date();
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);

    const prevWhereClause = sequenceId
      ? and(
          eq(outboundEmails.tenantId, authCtx.tenantId),
          eq(outboundEmails.enrollmentId, sequenceId),
          isNotNull(outboundEmails.contactId),
          sql`${outboundEmails.sentAt} >= ${prevWeekStart.toISOString()}`,
          sql`${outboundEmails.sentAt} < ${prevWeekEnd.toISOString()}`
        )
      : and(
          eq(outboundEmails.tenantId, authCtx.tenantId),
          isNotNull(outboundEmails.contactId),
          sql`${outboundEmails.sentAt} >= ${prevWeekStart.toISOString()}`,
          sql`${outboundEmails.sentAt} < ${prevWeekEnd.toISOString()}`
        );

    const [prevMetrics] = await db
      .select({
        totalSent: count(),
        totalOpened: sql<number>`count(*) filter (where ${outboundEmails.openedAt} is not null)`,
        totalReplied: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is not null)`,
        totalBounced: sql<number>`count(*) filter (where ${outboundEmails.status} = 'bounced')`,
      })
      .from(outboundEmails)
      .where(and(prevWhereClause, isNotNull(outboundEmails.sentAt)));

    const prevTotalSent = Number(prevMetrics?.totalSent || 0);
    const prevTotalOpened = Number(prevMetrics?.totalOpened || 0);
    const prevTotalReplied = Number(prevMetrics?.totalReplied || 0);
    const prevTotalBounced = Number(prevMetrics?.totalBounced || 0);

    const [prevSpamMetrics] = await db
      .select({ spamCount: count() })
      .from(outboundEmails)
      .where(and(prevWhereClause, eq(outboundEmails.bounceType, "complaint")));
    const prevSpamCount = Number(prevSpamMetrics?.spamCount || 0);

    const prevWeek = prevTotalSent > 0
      ? {
          openRate: Math.round((prevTotalOpened / prevTotalSent) * 100),
          replyRate: Math.round((prevTotalReplied / prevTotalSent) * 100),
          bounceRate: Math.round((prevTotalBounced / prevTotalSent) * 100),
          spamRate: Math.round((prevSpamCount / prevTotalSent) * 10000) / 100,
          totalSent: prevTotalSent,
        }
      : undefined;

    // Health score
    let healthScore = 100;
    if (bounceRate > 10) healthScore -= 40;
    else if (bounceRate > 5) healthScore -= 20;
    else if (bounceRate > 2) healthScore -= 10;
    if (spamRate > 0.3) healthScore -= 30;
    else if (spamRate > 0.1) healthScore -= 15;
    if (totalSent > 10 && openRate < 10) healthScore -= 20;
    else if (totalSent > 10 && openRate < 20) healthScore -= 10;
    if (totalSent === 0) healthScore = 0;

    const healthLabel =
      healthScore >= 80 ? "excellent" :
      healthScore >= 60 ? "good" :
      healthScore >= 40 ? "fair" : "poor";

    // Warnings
    const warnings: string[] = [];
    if (bounceRate > 5) warnings.push(`Bounce rate ${bounceRate}% exceeds 5% threshold. Check email list quality.`);
    if (spamRate > 0.1) warnings.push(`Spam complaint rate ${spamRate}% exceeds 0.1% Gmail threshold. Risk of domain blacklisting.`);
    if (totalSent > 20 && openRate < 15) warnings.push(`Open rate ${openRate}% is low. Consider improving subject lines or warming up domains.`);
    if (totalSent > 20 && replyRate < 2) warnings.push(`Reply rate ${replyRate}% is very low. Review email personalization and targeting.`);

    return Response.json({
      totalSent,
      totalOpened,
      totalReplied,
      totalBounced,
      totalDelivered,
      totalClicked,
      spamComplaints: spamCount,
      openRate,
      replyRate,
      bounceRate,
      clickRate,
      spamRate,
      healthScore: Math.max(0, healthScore),
      healthLabel,
      warnings,
      enrollmentsByStatus,
      stepMetrics,
      mailboxHealth,
      prevWeek,
    });
  } catch (error) {
    console.error("Deliverability check failed:", error);
    return Response.json({ error: "Failed to compute deliverability" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleDeliverability(req);
}

export async function POST(req: Request) {
  return handleDeliverability(req);
}
