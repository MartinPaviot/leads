import { db } from "@/db";
import { actionOutcomes, outboundEmails, activities, tasks } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";

const POSITIVITY: Record<string, number> = {
  replied_positive: 1.0,
  meeting_booked: 0.9,
  deal_advanced: 0.8,
  replied_neutral: 0.4,
  email_clicked: 0.3,
  email_opened: 0.1,
  no_response: 0.0,
  replied_negative: -0.3,
  unsubscribed: -0.6,
  bounced: -0.8,
  deal_lost: -1.0,
};

export async function resolveOutcome(
  outcomeId: string,
  outcomeType: string,
): Promise<void> {
  const [outcome] = await db
    .select()
    .from(actionOutcomes)
    .where(eq(actionOutcomes.id, outcomeId))
    .limit(1);

  if (!outcome || outcome.status !== "watching") return;

  const positivity = POSITIVITY[outcomeType] ?? 0.0;
  const timeToOutcomeHours =
    (Date.now() - outcome.watchingSince.getTime()) / (1000 * 60 * 60);

  await db
    .update(actionOutcomes)
    .set({
      status: "resolved",
      outcomeType,
      positivity,
      timeToOutcomeHours: Math.round(timeToOutcomeHours * 10) / 10,
      resolvedAt: new Date(),
    })
    .where(eq(actionOutcomes.id, outcomeId));

  await inngest.send({
    name: "outcome/resolved",
    data: {
      tenantId: outcome.tenantId,
      outcomeId: outcome.id,
      actionId: outcome.actionId,
      actionType: outcome.actionType,
      outcomeType,
      positivity,
      triggerType: outcome.triggerType,
      timeToOutcomeHours,
    },
  }).catch(() => {});
}

export async function checkEmailOutcomes(
  tenantId: string,
  contactId: string,
  eventType: "opened" | "clicked" | "replied_positive" | "replied_negative" | "bounced",
): Promise<void> {
  const watchingOutcomes = await db
    .select()
    .from(actionOutcomes)
    .where(
      and(
        eq(actionOutcomes.tenantId, tenantId),
        eq(actionOutcomes.entityId, contactId),
        eq(actionOutcomes.status, "watching"),
      ),
    )
    .limit(10);

  const outcomeType =
    eventType === "opened" ? "email_opened" :
    eventType === "clicked" ? "email_clicked" :
    eventType === "bounced" ? "bounced" :
    eventType;

  for (const outcome of watchingOutcomes) {
    if (
      outcome.actionType === "send_followup" ||
      outcome.actionType === "draft_reply" ||
      outcome.actionType === "enroll_sequence" ||
      outcome.actionType === "email-send" ||
      outcome.actionType === "email-reply"
    ) {
      await resolveOutcome(outcome.id, outcomeType);
    }
  }
}

export async function checkDealOutcomes(
  tenantId: string,
  dealId: string,
  eventType: "deal_advanced" | "deal_lost",
): Promise<void> {
  const watchingOutcomes = await db
    .select()
    .from(actionOutcomes)
    .where(
      and(
        eq(actionOutcomes.tenantId, tenantId),
        eq(actionOutcomes.entityId, dealId),
        eq(actionOutcomes.status, "watching"),
      ),
    )
    .limit(10);

  for (const outcome of watchingOutcomes) {
    await resolveOutcome(outcome.id, eventType);
  }
}
