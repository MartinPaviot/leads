import { db } from "@/db";
import { pipelineEvents } from "@/db/schema";

export type PipelineStage =
  | "enriched"
  | "signal_detected"
  | "enrolled"
  | "email_generated"
  | "email_queued"
  | "email_sent"
  | "email_delivered"
  | "email_opened"
  | "email_clicked"
  | "email_replied"
  | "email_bounced"
  | "meeting_booked"
  | "deal_created"
  | "deal_won"
  | "deal_lost";

export async function trackPipeline(params: {
  traceId?: string;
  tenantId: string;
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  enrollmentId?: string | null;
  outboundEmailId?: string | null;
  stage: PipelineStage;
  sourceSystem: "inngest" | "bullmq" | "webhook" | "cron" | "api";
  durationMs?: number;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const traceId = params.traceId || crypto.randomUUID();

  await db
    .insert(pipelineEvents)
    .values({
      traceId,
      tenantId: params.tenantId,
      companyId: params.companyId ?? undefined,
      contactId: params.contactId ?? undefined,
      dealId: params.dealId ?? undefined,
      enrollmentId: params.enrollmentId ?? undefined,
      outboundEmailId: params.outboundEmailId ?? undefined,
      stage: params.stage,
      sourceSystem: params.sourceSystem,
      durationMs: params.durationMs,
      metadata: params.metadata ?? {},
    })
    .catch((err) => {
      console.warn("[pipeline-tracker] Failed to record event:", err.message);
    });

  return traceId;
}
