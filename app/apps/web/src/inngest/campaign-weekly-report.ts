/**
 * Campaign Weekly Report — Campaign Engine 1000x
 *
 * Generates a weekly intelligence report:
 * - Strategy performance breakdown
 * - Auto-detected learnings (which playbooks work, which don't)
 * - Deliverability health summary
 * - Trust score change
 * - Recommendations
 */

import { inngest } from "./client";
import { db } from "@/db";
import {
  tenants,
  outboundEmails,
  outreachPlaybooks,
  systemTrustScore,
  connectedMailboxes,
} from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { z } from "zod";

const learningSchema = z.object({
  learnings: z.array(z.object({
    finding: z.string(),
    action: z.string(),
    autoApplicable: z.boolean(),
  })),
  recommendation: z.string(),
});

export const campaignWeeklyReport = inngest.createFunction(
  {
    id: "campaign-engine/weekly-report",
    name: "Campaign Weekly Intelligence Report",
    retries: 1,
    triggers: [{ cron: "0 9 * * 1" }], // Monday 9am UTC
  },
  async ({ step }) => {
    const allTenants = await step.run("get-tenants", async () => {
      return db.select({ id: tenants.id }).from(tenants).limit(100);
    });

    for (const tenant of allTenants) {
      await step.run(`report-${tenant.id}`, async () => {
        await generateTenantReport(tenant.id);
      });
    }

    return { tenantsProcessed: allTenants.length };
  }
);

async function generateTenantReport(tenantId: string): Promise<void> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Get send stats
  const [emailStats] = await db
    .select({
      sent: sql<number>`count(*) filter (where status in ('sent', 'delivered'))`,
      opened: sql<number>`count(*) filter (where opened_at is not null)`,
      replied: sql<number>`count(*) filter (where replied_at is not null)`,
      bounced: sql<number>`count(*) filter (where status = 'bounced')`,
    })
    .from(outboundEmails)
    .where(and(eq(outboundEmails.tenantId, tenantId), gte(outboundEmails.sentAt, weekAgo)));

  const sent = Number(emailStats?.sent || 0);
  if (sent === 0) return; // No activity, skip report

  const replied = Number(emailStats?.replied || 0);
  const replyRate = sent > 0 ? (replied / sent * 100).toFixed(1) : "0";

  // Get playbook performance
  const playbooks = await db
    .select()
    .from(outreachPlaybooks)
    .where(eq(outreachPlaybooks.tenantId, tenantId));

  const playbookSummary = playbooks
    .filter((p) => (p.totalSent || 0) > 0)
    .map((p) => `${p.strategyType}: ${p.totalSent} sent, ${p.totalReplied} replied (${p.avgReplyRate ? (p.avgReplyRate * 100).toFixed(0) : 0}%)`)
    .join("\n");

  // Get trust score
  const [trust] = await db
    .select()
    .from(systemTrustScore)
    .where(eq(systemTrustScore.tenantId, tenantId))
    .limit(1);

  // Get deliverability
  const mailboxes = await db
    .select()
    .from(connectedMailboxes)
    .where(eq(connectedMailboxes.tenantId, tenantId));

  const avgHealth = mailboxes.length > 0
    ? Math.round(mailboxes.reduce((sum, m) => sum + (m.healthScore || 100), 0) / mailboxes.length)
    : 100;

  // LLM: generate learnings
  try {
    const model = anthropic("claude-sonnet-4-6");

    const { object } = await tracedGenerateObject({
      model,
      schema: learningSchema,
      prompt: `Analyze this week's campaign performance and identify actionable learnings.

METRICS THIS WEEK:
- Emails sent: ${sent}
- Replies: ${replied} (${replyRate}%)
- Bounced: ${emailStats?.bounced || 0}

PLAYBOOK PERFORMANCE:
${playbookSummary || "No playbook data yet"}

DELIVERABILITY: ${avgHealth}/100 health score
TRUST SCORE: ${trust?.overall || 50}/100

Identify 1-3 specific learnings. Each learning should be:
1. A concrete finding (what happened)
2. A specific action (what to change)
3. Whether it can be auto-applied (true) or needs human review (false)

Also provide one overall recommendation for next week.`,
      _trace: { agentId: "weekly-report", tenantId, inputPreview: `Weekly report: ${sent} sent, ${replyRate}% reply` },
    });

    // Store the report (using the notifications table for now)
    const { notifications } = await import("@/db/schema");
    const { users } = await import("@/db/schema");
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantId)).limit(1);

    if (user) {
      await db.insert(notifications).values({
        tenantId,
        userId: user.id,
        type: "system" as any,
        title: `Weekly Campaign Report: ${sent} sent, ${replyRate}% reply rate`,
        body: JSON.stringify({
          metrics: { sent, replied, replyRate, bounced: emailStats?.bounced || 0 },
          learnings: object.learnings,
          recommendation: object.recommendation,
          deliverabilityHealth: avgHealth,
          trustScore: trust?.overall || 50,
        }),
        entityType: "report",
        entityId: `weekly-${new Date().toISOString().slice(0, 10)}`,
      });
    }
  } catch {
    // Non-critical: report generation failed, continue
  }
}
