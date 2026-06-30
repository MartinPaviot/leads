import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { requireCapability } from "@/lib/auth/permissions";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { hydrateExistingAccounts } from "@/lib/linkedin/account-hydration";
import logger from "@/lib/observability/logger";
import { clampHydrationLimit, pickHydrationSeat } from "@/lib/linkedin/hydration-seat";

/**
 * POST /api/linkedin/hydrate-accounts — spec 36 (T11): the on-demand trigger for
 * `hydrateExistingAccounts`. Re-tags EXISTING canonical accounts with their real
 * LinkedIn firmographics (precise industry → column via provenance, full
 * industries/specialties/HQ/headcount-growth → properties.linkedin, the coarse
 * ICP label preserved in properties.icpSegment), through a domain/name-confirmed
 * resolution so a name search never binds the wrong company.
 *
 * Gated `outbound:send` (RBAC, same posture as /api/linkedin/source — member
 * self-serve, viewers blocked). Bounded by `limit` (≤50 companies probed) to
 * protect the seat's LinkedIn profile-view quota; always advances the un-hydrated
 * backlog only. Body: { limit?: number }.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Belt-and-braces: re-check against the FRESH DB role (getAuthContext overlays
  // it) so a JWT minted before a member→viewer demotion can't still write.
  const denied = requireCapability(authCtx.role, "outbound:send");
  if (denied) return denied;

  const cfg = readUnipileConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Unipile is not configured. Set UNIPILE_API_KEY and UNIPILE_DSN." },
      { status: 503 },
    );
  }

  const rows = await db
    .select({
      status: linkedinAccount.status,
      unipileAccountId: linkedinAccount.unipileAccountId,
      seatType: linkedinAccount.seatType,
      userId: linkedinAccount.userId,
    })
    .from(linkedinAccount)
    .where(eq(linkedinAccount.tenantId, authCtx.tenantId))
    .orderBy(desc(linkedinAccount.updatedAt));

  const seat = pickHydrationSeat(rows, authCtx.userId);
  if (!seat || !seat.unipileAccountId) {
    return NextResponse.json(
      { error: "Connect a Sales Navigator (or Recruiter) seat first — company firmographics are a premium-tier feature." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = clampHydrationLimit(body.limit);

  try {
    const result = await hydrateExistingAccounts({
      tenantId: authCtx.tenantId,
      unipileAccountId: seat.unipileAccountId,
      limit,
      // Always advance only the un-hydrated backlog from the route. Re-hydrating
      // already-matched rows (onlyUnhydrated:false) is an admin/ops operation, not
      // member self-serve — exposing it would let a member re-spend the seat's
      // LinkedIn view quota in a loop on the same rows.
      onlyUnhydrated: true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("linkedin/hydrate-accounts: hydration failed", { tenantId: authCtx.tenantId, err });
    return NextResponse.json(
      { error: "Account hydration failed. Check the seat is still connected." },
      { status: 502 },
    );
  }
}
