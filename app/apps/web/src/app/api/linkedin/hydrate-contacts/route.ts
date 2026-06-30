import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { requireCapability } from "@/lib/auth/permissions";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { clampHydrationLimit } from "@/lib/linkedin/hydration-seat";
import { hydrateExistingContacts } from "@/lib/linkedin/contact-hydration";
import logger from "@/lib/observability/logger";

/**
 * POST /api/linkedin/hydrate-contacts — spec 36 (T11): enrich existing contacts
 * with their full LinkedIn profile (title/seniority/current company/open-to-work),
 * warm engagers first. Gated `outbound:send` + fresh-role re-check; `limit`
 * clamped ≤50 and reserved against the seat's daily view budget. Works on any
 * connected seat (full profile for 1st-degree on classic; thinner out-of-network).
 * Body: { limit?: number; onlyUnhydrated?: boolean }.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireCapability(authCtx.role, "outbound:send");
  if (denied) return denied;

  const cfg = readUnipileConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Unipile is not configured. Set UNIPILE_API_KEY and UNIPILE_DSN." }, { status: 503 });
  }

  const rows = await db
    .select({ status: linkedinAccount.status, unipileAccountId: linkedinAccount.unipileAccountId, userId: linkedinAccount.userId })
    .from(linkedinAccount)
    .where(eq(linkedinAccount.tenantId, authCtx.tenantId))
    .orderBy(desc(linkedinAccount.updatedAt));
  const seat =
    rows.find((r) => r.status === "connected" && r.unipileAccountId && r.userId === authCtx.userId) ??
    rows.find((r) => r.status === "connected" && r.unipileAccountId) ??
    null;
  if (!seat?.unipileAccountId) {
    return NextResponse.json({ error: "Connect a LinkedIn seat first (Settings → Sending infrastructure)." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { limit?: number; onlyUnhydrated?: boolean };

  try {
    const result = await hydrateExistingContacts({
      tenantId: authCtx.tenantId,
      unipileAccountId: seat.unipileAccountId,
      limit: clampHydrationLimit(body.limit),
      onlyUnhydrated: body.onlyUnhydrated !== false,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("linkedin/hydrate-contacts: failed", { tenantId: authCtx.tenantId, err });
    return NextResponse.json({ error: "Contact hydration failed. Check the seat is still connected." }, { status: 502 });
  }
}
