import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { readUnipileConfig, createHostedAuthLink } from "@/lib/providers/unipile/http";
import logger from "@/lib/observability/logger";

/**
 * GET /api/linkedin/connect — the seat's connection status for the current
 * user, plus whether Unipile is configured. Drives the settings UI.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: linkedinAccount.id,
      status: linkedinAccount.status,
      displayName: linkedinAccount.displayName,
      profileUrl: linkedinAccount.profileUrl,
      seatType: linkedinAccount.seatType,
    })
    .from(linkedinAccount)
    .where(and(eq(linkedinAccount.tenantId, authCtx.tenantId), eq(linkedinAccount.userId, authCtx.userId)))
    .orderBy(desc(linkedinAccount.updatedAt));

  // Prefer a connected seat; else the most recently touched row.
  const account = rows.find((r) => r.status === "connected") ?? rows[0] ?? null;
  return NextResponse.json({ configured: readUnipileConfig() !== null, account });
}

/**
 * POST /api/linkedin/connect — spec 36 (T6).
 *
 * Connect (or reconnect) a LinkedIn / Sales-Navigator seat from WITHIN Elevay,
 * not the Unipile dashboard. We mint a hosted-auth URL; the founder opens it in
 * a new tab, logs in on Unipile's hosted page (credentials never touch us), and
 * the callback webhook flips the row to `connected`. Sales Navigator is
 * auto-detected from the premium login.
 *
 * Body: { reconnectAccountId?: string }  — when reconnecting an existing seat.
 * Returns: { ok, url, accountId }  — open `url` in a NEW TAB (never an iframe;
 * the LinkedIn captcha breaks in a frame).
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = readUnipileConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Unipile is not configured. Set UNIPILE_API_KEY and UNIPILE_DSN." },
      { status: 503 },
    );
  }
  if (!cfg.webhookSecret) {
    return NextResponse.json(
      { error: "Set UNIPILE_WEBHOOK_SECRET before connecting (secures the callback)." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { reconnectAccountId?: string; origin?: string };
  const isReconnect = typeof body.reconnectAccountId === "string" && body.reconnectAccountId.length > 0;
  const fromOnboarding = body.origin === "onboarding";

  // Resolve the row we will attach the connection to.
  let row: { id: string; unipileAccountId: string | null };
  if (isReconnect) {
    const [existing] = await db
      .select({ id: linkedinAccount.id, unipileAccountId: linkedinAccount.unipileAccountId })
      .from(linkedinAccount)
      .where(and(eq(linkedinAccount.id, body.reconnectAccountId!), eq(linkedinAccount.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    row = existing;
    await db.update(linkedinAccount).set({ status: "reconnect_required", updatedAt: new Date() }).where(eq(linkedinAccount.id, row.id));
  } else {
    // Reuse a pending row for this user if one exists, else create one.
    const [pending] = await db
      .select({ id: linkedinAccount.id, unipileAccountId: linkedinAccount.unipileAccountId })
      .from(linkedinAccount)
      .where(and(eq(linkedinAccount.tenantId, authCtx.tenantId), eq(linkedinAccount.userId, authCtx.userId), eq(linkedinAccount.status, "pending")))
      .limit(1);
    if (pending) {
      row = pending;
    } else {
      const [created] = await db
        .insert(linkedinAccount)
        .values({ tenantId: authCtx.tenantId, userId: authCtx.userId, provider: "unipile", status: "pending" })
        .returning({ id: linkedinAccount.id, unipileAccountId: linkedinAccount.unipileAccountId });
      row = created;
    }
  }

  // .trim() is load-bearing: the prod NEXT_PUBLIC_APP_URL carries a trailing
  // newline, which would otherwise corrupt the notify_url/redirect URLs.
  const publicBase = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "");
  const notifyUrl = `${publicBase}/api/linkedin/unipile/account-webhook?token=${encodeURIComponent(cfg.webhookSecret)}`;
  const expiresOn = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  // Context-aware redirect: a connect started in onboarding returns there, not
  // Settings (which would drop the founder out of the flow).
  const redirectBase = fromOnboarding ? `${publicBase}/home?onboarding=1` : `${publicBase}/settings/sending-infrastructure`;
  const redirectSep = redirectBase.includes("?") ? "&" : "?";

  try {
    const { url } = await createHostedAuthLink(cfg, {
      type: isReconnect ? "reconnect" : "create",
      providers: ["LINKEDIN"],
      apiUrl: cfg.dsn,
      expiresOn,
      notifyUrl,
      name: row.id, // echoed back as `name` → we match the callback to this row
      successRedirectUrl: `${redirectBase}${redirectSep}linkedin=connected`,
      failureRedirectUrl: `${redirectBase}${redirectSep}linkedin=failed`,
      reconnectAccount: isReconnect ? row.unipileAccountId ?? undefined : undefined,
    });
    return NextResponse.json({ ok: true, url, accountId: row.id });
  } catch (err) {
    logger.error("linkedin/connect: hosted-auth link failed", { tenantId: authCtx.tenantId, err });
    return NextResponse.json({ error: "Could not start LinkedIn connection. Check Unipile credentials." }, { status: 502 });
  }
}
