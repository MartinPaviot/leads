import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTenantSendingCapacity } from "@/lib/campaign-engine/deliverability/mailbox-selector";
import { checkMailboxHealth } from "@/lib/campaign-engine/deliverability/health-monitor";
import { getWarmupProgress } from "@/lib/campaign-engine/deliverability/warmup";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const capacity = await getTenantSendingCapacity(authCtx.tenantId);

  const mailboxes = await db
    .select()
    .from(connectedMailboxes)
    .where(eq(connectedMailboxes.tenantId, authCtx.tenantId));

  const mailboxReports = await Promise.all(
    mailboxes.map(async (m) => {
      const health = await checkMailboxHealth(m.id);
      const warmup = m.warmupStartedAt ? getWarmupProgress(m.warmupStartedAt) : null;

      return {
        id: m.id,
        emailAddress: m.emailAddress,
        domain: m.domain,
        status: m.status,
        healthScore: health.healthScore,
        metrics: health.metrics,
        issues: health.issues,
        warmup,
        dailyLimit: m.dailyLimit,
        sentToday: m.sentToday,
      };
    })
  );

  return Response.json({
    capacity,
    mailboxes: mailboxReports,
    overallHealth: mailboxReports.length > 0
      ? Math.round(mailboxReports.reduce((sum, m) => sum + m.healthScore, 0) / mailboxReports.length)
      : 100,
  });
}
