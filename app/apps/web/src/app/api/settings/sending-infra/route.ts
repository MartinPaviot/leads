import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import {
  getTenantSettings,
  updateTenantSettings,
  type TenantSettings,
} from "@/lib/tenant-settings";
import { db } from "@/db";
import { sendingInfraRequests } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

/**
 * Settings → Sending infrastructure.
 *
 * GET  → current mode + caps + connected providers list + any
 *        pending managed-setup request.
 * PUT  → update caps and cold-on-primary flag. Mode transitions go
 *        through dedicated endpoints (`request-managed`,
 *        `providers/instantly/connect`) because each has
 *        side-effects beyond a settings write.
 */
const VALID_PRIMITIVE_PUT_KEYS = [
  "sendingDailyCapPrimary",
  "sendingAllowColdOnPrimary",
] as const;

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getTenantSettings(authCtx.tenantId);

  const pendingRequest = await db
    .select()
    .from(sendingInfraRequests)
    .where(
      and(
        eq(sendingInfraRequests.tenantId, authCtx.tenantId),
        inArray(sendingInfraRequests.status, ["pending", "in_progress"]),
      ),
    )
    .orderBy(desc(sendingInfraRequests.requestedAt))
    .limit(1);

  return NextResponse.json({
    mode: settings.sendingMailboxMode ?? "primary-with-caps",
    sendingDailyCapPrimary: settings.sendingDailyCapPrimary ?? 20,
    sendingAllowColdOnPrimary: settings.sendingAllowColdOnPrimary ?? false,
    providers: {
      // PR E only wires Instantly. If the ciphertext is present, we
      // surface { connected: true } without ever returning the key.
      instantly: {
        connected: !!settings.instantlyCredentialsEncrypted,
      },
    },
    pendingManagedRequest: pendingRequest[0]
      ? {
          id: pendingRequest[0].id,
          status: pendingRequest[0].status,
          requestedAt: pendingRequest[0].requestedAt,
          assigneeEmail: pendingRequest[0].assigneeEmail,
          notes: pendingRequest[0].notes,
        }
      : null,
  });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: Partial<TenantSettings> = {};

  if ("sendingDailyCapPrimary" in body) {
    const raw = body.sendingDailyCapPrimary;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 10_000) {
      return NextResponse.json(
        { error: "sendingDailyCapPrimary must be a number between 0 and 10000" },
        { status: 400 },
      );
    }
    updates.sendingDailyCapPrimary = Math.floor(raw);
  }

  if ("sendingAllowColdOnPrimary" in body) {
    updates.sendingAllowColdOnPrimary = !!body.sendingAllowColdOnPrimary;
  }

  // Refuse mutations of fields not in the allow-list so this endpoint
  // can't be used as a generic settings-write backdoor.
  const unknownKeys = Object.keys(body).filter(
    (k) => !(VALID_PRIMITIVE_PUT_KEYS as readonly string[]).includes(k),
  );
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      { error: `unknown keys in body: ${unknownKeys.join(", ")}` },
      { status: 400 },
    );
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "no recognised fields in body" },
      { status: 400 },
    );
  }

  await updateTenantSettings(authCtx.tenantId, updates);
  return NextResponse.json({ ok: true, updated: Object.keys(updates) });
}
