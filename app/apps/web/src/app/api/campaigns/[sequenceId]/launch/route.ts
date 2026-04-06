import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { sequences, outboundEmails } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

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
