import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { readUnipileConfig, verifyWebhookToken } from "@/lib/providers/unipile/http";
import logger from "@/lib/observability/logger";

/**
 * POST /api/linkedin/unipile/account-webhook — spec 36 (T6).
 *
 * Unipile hosted-auth + account-status callback. Two payload shapes:
 *  - hosted-auth:   { status, account_id, name }   (name = our row id)
 *  - account_status:{ AccountStatus: { account_id, message } }
 *
 * Verified by the ?token=<UNIPILE_WEBHOOK_SECRET> we put in notify_url
 * (fail-closed). On CREATION_SUCCESS/RECONNECTED we persist the Unipile
 * account_id and flip the seat to `connected`; on CREDENTIALS/ERROR/STOPPED
 * we flip it to `reconnect_required` so capacity goes fail-closed (T5).
 */
export async function POST(req: Request) {
  const cfg = readUnipileConfig();
  if (!verifyWebhookToken(req.url, cfg?.webhookSecret)) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const rawBody = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    // ── Account-status event: { AccountStatus: { account_id, message } } ──
    const accountStatus = body.AccountStatus as { account_id?: string; message?: string } | undefined;
    if (accountStatus?.account_id && accountStatus.message) {
      await applyAccountStatus(accountStatus.account_id, accountStatus.message);
      return Response.json({ ok: true });
    }

    // ── Hosted-auth callback: { status, account_id, name } ──
    const status = typeof body.status === "string" ? body.status : undefined;
    const accountId = typeof body.account_id === "string" ? body.account_id : undefined;
    const name = typeof body.name === "string" ? body.name : undefined; // our row id

    if (status && (status === "CREATION_SUCCESS" || status === "RECONNECTED") && accountId) {
      // Match by our row id (name) when present, else by the Unipile account id.
      const where = name ? eq(linkedinAccount.id, name) : eq(linkedinAccount.unipileAccountId, accountId);
      await db
        .update(linkedinAccount)
        .set({
          unipileAccountId: accountId,
          status: "connected",
          connectedAt: new Date(),
          lastHealthAt: new Date(),
          healthDetail: {},
          // Start the warmup ramp on FIRST connect; preserve it on reconnect
          // (a returning seat keeps its ramp progress). Without this a fresh seat
          // reads as fully warmed and would act at the steady cap on day one.
          warmupStartedAt: sql`coalesce(${linkedinAccount.warmupStartedAt}, now())`,
          updatedAt: new Date(),
        })
        .where(where);
      return Response.json({ ok: true });
    }

    if (status && accountId) {
      // Any other terminal hosted-auth status → needs attention.
      await applyAccountStatus(accountId, status);
      return Response.json({ ok: true });
    }

    return Response.json({ ok: true, ignored: true });
  } catch (err) {
    logger.error("linkedin account-webhook: processing failed", { err });
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

/** Map a Unipile status message onto the seat row, keyed by unipile_account_id. */
async function applyAccountStatus(unipileAccountId: string, message: string): Promise<void> {
  const healthy = message === "OK" || message === "RECONNECTED" || message === "SYNC_SUCCESS";
  await db
    .update(linkedinAccount)
    .set({
      status: healthy ? "connected" : "reconnect_required",
      lastHealthAt: new Date(),
      healthDetail: { reason: message },
      updatedAt: new Date(),
    })
    .where(eq(linkedinAccount.unipileAccountId, unipileAccountId));
}
