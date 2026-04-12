import { db } from "@/db";
import { sequences, sequenceEnrollments, outboundEmails, sequenceSteps } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import type { SkillRunOptions } from "@/skills/types";
import type { SequencePerformanceInput, SequencePerformanceOutput } from "./schema";

export async function sequencePerformanceHandler(
  input: SequencePerformanceInput,
  options: SkillRunOptions,
): Promise<SequencePerformanceOutput> {
  const periodStart = new Date(Date.now() - input.periodDays * 24 * 60 * 60 * 1000);

  // Fetch sequences
  const seqFilter = input.sequenceId
    ? and(eq(sequences.tenantId, options.tenantId), eq(sequences.id, input.sequenceId))
    : eq(sequences.tenantId, options.tenantId);

  const seqRecords = await db.select().from(sequences).where(seqFilter);

  const results: SequencePerformanceOutput["sequences"] = [];
  let totalEmailsSent = 0;
  let bestReplyRate = 0;
  let bestSequenceName: string | null = null;

  for (const seq of seqRecords) {
    // Get enrollments
    const enrollments = await db
      .select()
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.sequenceId, seq.id));

    const totalEnrolled = enrollments.length;
    const totalCompleted = enrollments.filter((e) => e.status === "completed").length;
    const totalReplied = enrollments.filter((e) => e.status === "replied").length;
    const totalBounced = enrollments.filter((e) => e.status === "bounced").length;

    // Get emails for this sequence's campaign
    const emails = await db
      .select()
      .from(outboundEmails)
      .where(and(
        eq(outboundEmails.tenantId, options.tenantId),
        eq(outboundEmails.campaignId, seq.id),
      ));

    // Get steps
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, seq.id));

    // Per-step metrics
    const stepMetrics = steps.map((step) => {
      const stepEmails = emails.filter((e) => {
        const meta = e.metadata as Record<string, unknown> | null;
        return meta?.stepNumber === step.stepNumber;
      });

      const sent = stepEmails.filter((e) => ["sent", "delivered", "opened", "clicked", "replied"].includes(e.status)).length;
      const delivered = stepEmails.filter((e) => ["delivered", "opened", "clicked", "replied"].includes(e.status)).length;
      const opened = stepEmails.filter((e) => e.openedAt !== null).length;
      const clicked = stepEmails.filter((e) => e.clickedAt !== null).length;
      const replied = stepEmails.filter((e) => e.repliedAt !== null).length;
      const bounced = stepEmails.filter((e) => e.status === "bounced").length;

      return {
        stepNumber: step.stepNumber,
        sent,
        delivered,
        opened,
        clicked,
        replied,
        bounced,
        openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
        replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
        bounceRate: sent > 0 ? Math.round((bounced / sent) * 100) : 0,
      };
    }).sort((a, b) => a.stepNumber - b.stepNumber);

    const sentTotal = emails.filter((e) => e.status !== "draft" && e.status !== "queued").length;
    totalEmailsSent += sentTotal;

    const overallReplyRate = totalEnrolled > 0
      ? Math.round((totalReplied / totalEnrolled) * 100)
      : 0;
    const overallBounceRate = totalEnrolled > 0
      ? Math.round((totalBounced / totalEnrolled) * 100)
      : 0;

    if (overallReplyRate > bestReplyRate && totalEnrolled >= 5) {
      bestReplyRate = overallReplyRate;
      bestSequenceName = seq.name;
    }

    results.push({
      sequenceId: seq.id,
      name: seq.name,
      status: seq.status,
      totalEnrolled,
      totalCompleted,
      totalReplied,
      totalBounced,
      overallReplyRate,
      overallBounceRate,
      stepMetrics,
    });
  }

  const avgReplyRate = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.overallReplyRate, 0) / results.length)
    : 0;
  const avgBounceRate = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.overallBounceRate, 0) / results.length)
    : 0;

  return {
    period: `${input.periodDays} days`,
    sequences: results,
    summary: {
      totalSequences: results.length,
      totalEmailsSent,
      avgReplyRate,
      avgBounceRate,
      bestPerformingSequence: bestSequenceName,
    },
  };
}
