import { db } from "@/db";
import { actionOutcomes } from "@/db/schema";

const WINDOW_HOURS: Record<string, number> = {
  "email-send": 168,      // 7 days
  "email-reply": 168,     // 7 days
  "deal-stage-change": 336, // 14 days
  "task-create": 168,     // 7 days
  "sequence-enrollment": 336, // 14 days
  "contact-create": 72,   // 3 days (enrichment)
  send_followup: 168,
  draft_reply: 168,
  advance_deal: 336,
  create_task: 168,
  create_deal: 336,
  enroll_sequence: 336,
  alert_founder: 24,
  research_company: 72,
  enrich_contact: 72,
};

const EXPECTED_OUTCOMES: Record<string, string> = {
  send_followup: "email_reply",
  draft_reply: "email_reply",
  advance_deal: "deal_advance",
  create_task: "task_completed",
  create_deal: "deal_advance",
  enroll_sequence: "email_reply",
  alert_founder: "acknowledged",
  research_company: "enrichment_complete",
  enrich_contact: "enrichment_complete",
};

export async function createOutcomeWatcher(params: {
  tenantId: string;
  actionId: string;
  reactionId?: string;
  entityType: string;
  entityId: string;
  actionType: string;
  triggerType?: string;
  entitySnapshot?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const windowHours = WINDOW_HOURS[params.actionType] ?? 168;
  const expectedOutcome = EXPECTED_OUTCOMES[params.actionType] ?? "positive_signal";
  const windowExpiresAt = new Date(Date.now() + windowHours * 60 * 60 * 1000);

  const [row] = await db
    .insert(actionOutcomes)
    .values({
      tenantId: params.tenantId,
      actionId: params.actionId,
      reactionId: params.reactionId ?? null,
      entityType: params.entityType,
      entityId: params.entityId,
      actionType: params.actionType,
      expectedOutcome,
      observationWindowHours: windowHours,
      windowExpiresAt,
      triggerType: params.triggerType ?? null,
      entitySnapshot: params.entitySnapshot ?? {},
    })
    .returning({ id: actionOutcomes.id });

  return { id: row.id };
}
