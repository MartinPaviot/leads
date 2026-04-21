import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { updateTenantSettings } from "@/lib/tenant-settings";
import { db } from "@/db";
import { sendingInfraRequests } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import logger from "@/lib/logger";
import { Resend } from "resend";

/**
 * POST /api/settings/sending-infra/request-managed
 *
 * Creates a `sending_infra_requests` row, flips the tenant's
 * `sendingMailboxMode` to `elevay-managed-requested`, and notifies
 * the ops team so they can set up a dedicated sending domain.
 *
 * Idempotent: if the tenant already has an active (pending or
 * in_progress) request, the same row is returned without creating
 * a duplicate.
 *
 * Notification channel (plan §1 Q4): Resend email to
 * `process.env.OPS_EMAIL_ADDRESS`. Falls back to `[OPS-REQUEST]`
 * console log if the env var is unset.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = (await req.json().catch(() => ({}))) as {
    notes?: string;
  };

  // Idempotency — one active request at a time per tenant.
  const [existing] = await db
    .select()
    .from(sendingInfraRequests)
    .where(
      and(
        eq(sendingInfraRequests.tenantId, authCtx.tenantId),
        inArray(sendingInfraRequests.status, ["pending", "in_progress"]),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyRequested: true,
      request: {
        id: existing.id,
        status: existing.status,
        requestedAt: existing.requestedAt,
      },
    });
  }

  const [row] = await db
    .insert(sendingInfraRequests)
    .values({
      tenantId: authCtx.tenantId,
      requestedByUserId: authCtx.userId,
      status: "pending",
      notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
    })
    .returning();

  await updateTenantSettings(authCtx.tenantId, {
    sendingMailboxMode: "elevay-managed-requested",
  });

  await notifyOps({
    tenantId: authCtx.tenantId,
    requestId: row.id,
    requestedByUserId: authCtx.userId,
    notes: row.notes ?? null,
  }).catch((err) => {
    // Notification failure must not roll back the request row — ops
    // will find it on the dashboard anyway. Log for observability.
    logger.warn("sending-infra: ops notification failed", {
      tenantId: authCtx.tenantId,
      err,
    });
  });

  return NextResponse.json({
    ok: true,
    alreadyRequested: false,
    request: {
      id: row.id,
      status: row.status,
      requestedAt: row.requestedAt,
    },
  });
}

/** Best-effort email notification to the ops inbox. */
async function notifyOps(params: {
  tenantId: string;
  requestId: string;
  requestedByUserId: string;
  notes: string | null;
}): Promise<void> {
  const opsEmail = process.env.OPS_EMAIL_ADDRESS;
  const resendKey = process.env.RESEND_API_KEY;
  const message = [
    `New Elevay-managed sending infrastructure request`,
    `Tenant: ${params.tenantId}`,
    `Requested by: ${params.requestedByUserId}`,
    `Request ID: ${params.requestId}`,
    `Notes: ${params.notes ?? "(none)"}`,
  ].join("\n");

  if (!opsEmail || !resendKey) {
    console.log("[OPS-REQUEST]", message);
    return;
  }

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: "Elevay Ops <ops@elevay.com>",
    to: opsEmail,
    subject: `[Elevay Ops] Managed sending request — ${params.tenantId}`,
    text: message,
  });
}
