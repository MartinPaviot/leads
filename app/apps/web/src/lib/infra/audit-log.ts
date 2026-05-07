/**
 * Audit logging — tamper-evident, HMAC-signed activity records.
 *
 * RETENTION POLICY (SOC 2 Type II):
 *
 *   Audit entries are retained for 7 years per SOC 2 requirements.
 *   The data-retention cron (inngest/data-retention.ts) does NOT purge
 *   audit entries for canceled tenants. Audit rows live in the
 *   `activities` table with `activity_type = 'system_event'` and
 *   `metadata.audit = true`. The purge function explicitly excludes
 *   these rows to ensure compliance with the 7-year retention window.
 *
 *   Per-tenant retention period is configured via `auditRetentionPolicy`
 *   in TenantSettings (default: "7y"). This value is informational and
 *   enforced by the data-retention cron — individual delete operations
 *   must check it before removing any activity row with `audit: true`.
 *
 *   DO NOT add audit rows to any bulk-delete or data-export-and-purge
 *   flow without legal review.
 */

import { db } from "@/db";
import { activities } from "@/db/schema";
import { signAuditEntry } from "@/lib/infra/signed-audit";

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
