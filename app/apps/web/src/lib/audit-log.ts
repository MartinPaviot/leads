import { db } from "@/db";
import { activities } from "@/db/schema";
import { signAuditEntry } from "@/lib/signed-audit";

export async function logAudit(params: {
  tenantId: string;
  userId: string;
  action: "create" | "update" | "delete";
  entityType: string;
  entityId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const timestamp = new Date().toISOString();

    // Compute HMAC-SHA256 signature for tamper-evident audit trail
    const signature = signAuditEntry({
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      tenantId: params.tenantId,
      userId: params.userId,
      timestamp,
      changes: (params.changes as Record<string, unknown>) ?? {},
    });

    await db.insert(activities).values({
      tenantId: params.tenantId,
      activityType: "system_event",
      actorType: "user",
      actorId: params.userId,
      entityType: params.entityType,
      entityId: params.entityId,
      channel: "system",
      direction: "internal",
      summary: `User ${params.action}d ${params.entityType}`,
      metadata: {
        audit: true,
        action: params.action,
        changes: params.changes ?? null,
        signature,
        signedAt: timestamp,
        ...params.metadata,
      },
    });
  } catch (error) {
    // Audit logging should never break the main operation
    console.error("Failed to write audit log:", error);
  }
}
