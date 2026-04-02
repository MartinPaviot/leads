import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { activities, sequenceEnrollments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allActivities = await db.select().from(activities).where(eq(activities.tenantId, authCtx.tenantId));
    const allEnrollments = await db.select().from(sequenceEnrollments);

    // Email activity breakdown
    const emailsSent = allActivities.filter((a) => a.activityType === "email_sent");
    const emailsOpened = allActivities.filter((a) => a.activityType === "email_opened");
    const emailsReplied = allActivities.filter((a) => a.activityType === "email_replied");
    const emailsBounced = allActivities.filter((a) => a.activityType === "email_bounced");

    const totalSent = emailsSent.length;
    const totalOpened = emailsOpened.length;
    const totalReplied = emailsReplied.length;
    const totalBounced = emailsBounced.length;

    // Rates
    const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
    const replyRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0;
    const bounceRate = totalSent > 0 ? Math.round((totalBounced / totalSent) * 100) : 0;

    // Spam complaint rate (from metadata)
    const spamComplaints = emailsSent.filter(
      (a) => (a.metadata as Record<string, unknown>)?.spamComplaint === true
    );
    const spamRate = totalSent > 0 ? Math.round((spamComplaints.length / totalSent) * 10000) / 100 : 0;

    // Enrollment status breakdown
    const enrollmentsByStatus: Record<string, number> = {};
    for (const e of allEnrollments) {
      const status = e.status || "unknown";
      enrollmentsByStatus[status] = (enrollmentsByStatus[status] || 0) + 1;
    }

    // Health score: 0-100
    // Penalty for high bounce (>5%), high spam (>0.1%), low open (<10%)
    let healthScore = 100;
    if (bounceRate > 10) healthScore -= 40;
    else if (bounceRate > 5) healthScore -= 20;
    else if (bounceRate > 2) healthScore -= 10;

    if (spamRate > 0.3) healthScore -= 30;
    else if (spamRate > 0.1) healthScore -= 15;

    if (totalSent > 10 && openRate < 10) healthScore -= 20;
    else if (totalSent > 10 && openRate < 20) healthScore -= 10;

    if (totalSent === 0) healthScore = 0; // No data

    const healthLabel =
      healthScore >= 80 ? "excellent" :
      healthScore >= 60 ? "good" :
      healthScore >= 40 ? "fair" :
      "poor";

    // Warnings
    const warnings: string[] = [];
    if (bounceRate > 5) {
      warnings.push(`Bounce rate ${bounceRate}% exceeds 5% threshold. Check email list quality.`);
    }
    if (spamRate > 0.1) {
      warnings.push(`Spam complaint rate ${spamRate}% exceeds 0.1% Gmail threshold. Risk of domain blacklisting.`);
    }
    if (totalSent > 20 && openRate < 15) {
      warnings.push(`Open rate ${openRate}% is low. Consider improving subject lines or warming up domains.`);
    }
    if (totalSent > 20 && replyRate < 2) {
      warnings.push(`Reply rate ${replyRate}% is very low. Review email personalization and targeting.`);
    }

    return Response.json({
      totalSent,
      totalOpened,
      totalReplied,
      totalBounced,
      spamComplaints: spamComplaints.length,
      openRate,
      replyRate,
      bounceRate,
      spamRate,
      healthScore: Math.max(0, healthScore),
      healthLabel,
      warnings,
      enrollmentsByStatus,
    });
  } catch (error) {
    console.error("Deliverability check failed:", error);
    return Response.json({ error: "Failed to compute deliverability" }, { status: 500 });
  }
}
