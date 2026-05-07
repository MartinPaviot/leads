import { db } from "@/db";
import { connectedMailboxes, outboundEmails } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import type { DomainHealthReport, HealthIssue } from "./types";

const BOUNCE_RATE_WARN = 0.03;
const BOUNCE_RATE_PAUSE = 0.05;
const COMPLAINT_RATE_WARN = 0.001;
const COMPLAINT_RATE_PAUSE = 0.003;
const MIN_SENDS_FOR_EVALUATION = 20;

export async function checkMailboxHealth(mailboxId: string): Promise<DomainHealthReport> {
  const [mailbox] = await db
    .select()
    .from(connectedMailboxes)
    .where(eq(connectedMailboxes.id, mailboxId))
    .limit(1);

  if (!mailbox) {
    return {
      domainId: mailboxId,
      domain: "unknown",
      healthScore: 0,
      metrics: { sentLast7d: 0, bouncesLast7d: 0, complaintsLast7d: 0, bounceRate: 0, complaintRate: 0 },
      issues: [{ severity: "critical", message: "Mailbox not found", metric: "existence", value: 0, threshold: 1 }],
      action: "retire",
    };
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get send stats for last 7 days
  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      bounced: sql<number>`count(*) filter (where status = 'bounced')`,
    })
    .from(outboundEmails)
    .where(
      and(
        eq(outboundEmails.mailboxId, mailboxId),
        gte(outboundEmails.sentAt, sevenDaysAgo)
      )
    );

  const sentLast7d = Number(stats?.total || 0);
  const bouncesLast7d = Number(stats?.bounced || 0);
  const complaintsLast7d = mailbox.bounceCount7d || 0; // using existing field as proxy

  const bounceRate = sentLast7d > 0 ? bouncesLast7d / sentLast7d : 0;
  const complaintRate = sentLast7d > 0 ? complaintsLast7d / sentLast7d : 0;

  const issues: HealthIssue[] = [];
  let action: DomainHealthReport["action"] = "none";

  // Only evaluate if enough sends
  if (sentLast7d >= MIN_SENDS_FOR_EVALUATION) {
    if (bounceRate >= BOUNCE_RATE_PAUSE) {
      issues.push({ severity: "critical", message: "Bounce rate critically high", metric: "bounceRate", value: bounceRate, threshold: BOUNCE_RATE_PAUSE });
      action = "pause";
    } else if (bounceRate >= BOUNCE_RATE_WARN) {
      issues.push({ severity: "warning", message: "Bounce rate elevated", metric: "bounceRate", value: bounceRate, threshold: BOUNCE_RATE_WARN });
      action = "warn";
    }

    if (complaintRate >= COMPLAINT_RATE_PAUSE) {
      issues.push({ severity: "critical", message: "Complaint rate critically high — risk of domain block", metric: "complaintRate", value: complaintRate, threshold: COMPLAINT_RATE_PAUSE });
      action = "pause";
    } else if (complaintRate >= COMPLAINT_RATE_WARN) {
      issues.push({ severity: "warning", message: "Complaint rate elevated", metric: "complaintRate", value: complaintRate, threshold: COMPLAINT_RATE_WARN });
      if (action !== "pause") action = "warn";
    }
  }

  // Compute health score (0-100)
  let healthScore = 100;
  if (bounceRate > 0) healthScore -= Math.min(40, Math.round(bounceRate * 1000));
  if (complaintRate > 0) healthScore -= Math.min(40, Math.round(complaintRate * 10000));
  if (sentLast7d === 0) healthScore -= 10; // inactivity penalty
  healthScore = Math.max(0, healthScore);

  return {
    domainId: mailboxId,
    domain: mailbox.domain || mailbox.emailAddress,
    healthScore,
    metrics: { sentLast7d, bouncesLast7d, complaintsLast7d, bounceRate, complaintRate },
    issues,
    action,
  };
}

export async function executeHealthAction(report: DomainHealthReport): Promise<void> {
  if (report.action === "pause") {
    await db
      .update(connectedMailboxes)
      .set({ status: "paused" })
      .where(eq(connectedMailboxes.id, report.domainId));
  }

  // Update health score in DB
  await db
    .update(connectedMailboxes)
    .set({ healthScore: report.healthScore })
    .where(eq(connectedMailboxes.id, report.domainId));
}
