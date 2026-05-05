import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequences, outboundEmails } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { gateAction } from "@/lib/campaign-engine/execution-gate";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sequenceId: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sequenceId } = await params;

  // Validate sequence
  const [sequence] = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.id, sequenceId), eq(sequences.tenantId, authCtx.tenantId)))
    .limit(1);

  if (!sequence) {
    return Response.json({ error: "Sequence not found" }, { status: 404 });
  }

  const config = (sequence.campaignConfig || {}) as any;
  if (config.status !== "ready") {
    return Response.json(
      { error: `Campaign is not ready (current status: ${config.status || "idle"})` },
      { status: 400 }
    );
  }

  // Check execution gate before launching
  const gateResult = await gateAction({
    actionType: "coldEmailSend",
    tenantId: authCtx.tenantId,
  });

  if (gateResult.status === "blocked") {
    return Response.json(
      { error: `Campaign blocked: ${gateResult.reason}` },
      { status: 403 }
    );
  }

  if (gateResult.status === "queued_for_approval") {
    // Mark campaign as "pending_approval" instead of launching
    const pendingConfig = { ...config, status: "pending_approval" };
    await db
      .update(sequences)
      .set({ campaignConfig: pendingConfig, updatedAt: new Date() })
      .where(eq(sequences.id, sequenceId));

    return Response.json({
      launched: false,
      status: "pending_approval",
      reason: gateResult.reason,
      sequenceId,
    });
  }

  // Bulk-transition all approved draft emails to queued
  const result = await db
    .update(outboundEmails)
    .set({ status: "queued", queuedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(outboundEmails.tenantId, authCtx.tenantId),
        eq(outboundEmails.campaignId, sequenceId),
        eq(outboundEmails.status, "draft")
      )
    );

  // Count how many were queued
  const [queuedCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(outboundEmails)
    .where(
      and(
        eq(outboundEmails.tenantId, authCtx.tenantId),
        eq(outboundEmails.campaignId, sequenceId),
        eq(outboundEmails.status, "queued")
      )
    );

  // Update campaign and sequence status
  const updatedConfig = { ...config, status: "launched" };
  await db
    .update(sequences)
    .set({
      campaignConfig: updatedConfig,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(sequences.id, sequenceId));

  return Response.json({
    launched: true,
    emailsQueued: Number(queuedCount?.count || 0),
    sequenceId,
  });
}
