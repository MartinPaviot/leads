import { db } from "@/db";
import { activities } from "@/db/schema";

/**
 * Journal a deal lifecycle EVENT into the activities table — the /home
 * Activity feed and the deal timeline read these rows. Every mutation path
 * (manual edit, manual create, transcript analysis, chat) calls this so the
 * feed reflects reality regardless of where the change came from.
 *
 * Fail-soft: journaling must never break the mutation it records.
 */
export async function logDealEvent(opts: {
  tenantId: string;
  dealId: string;
  type: "deal_created" | "deal_stage_changed" | "deal_won" | "deal_lost";
  actorType: "user" | "system";
  actorId?: string | null;
  summary: string;
  oldStage?: string | null;
  newStage?: string | null;
  /** Where the change came from: "manual" | "call_analysis" | "chat" | ... */
  triggeredBy: string;
}): Promise<void> {
  try {
    await db.insert(activities).values({
      tenantId: opts.tenantId,
      actorType: opts.actorType,
      actorId: opts.actorId ?? null,
      entityType: "deal",
      entityId: opts.dealId,
      activityType: opts.type,
      summary: opts.summary,
      metadata: {
        ...(opts.oldStage ? { oldStage: opts.oldStage } : {}),
        ...(opts.newStage ? { newStage: opts.newStage } : {}),
        triggeredBy: opts.triggeredBy,
      },
    });
  } catch (err) {
    console.warn("logDealEvent: journaling failed (non-blocking)", err);
  }
}
