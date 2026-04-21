import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { rankWarmLeads } from "@/lib/warm-leads";

/**
 * GET /api/warm-leads/scan — returns top-N warm leads for the
 * current tenant, ranked by recency × depth × ICP fit. Ephemeral
 * (no DB persistence, 5min in-memory cache in the ranker).
 *
 * Query params:
 *   limit    default 3
 *   sinceDays default 90
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(
    10,
    Math.max(1, Number(url.searchParams.get("limit") ?? 3)),
  );
  const sinceDays = Math.min(
    365,
    Math.max(7, Number(url.searchParams.get("sinceDays") ?? 90)),
  );

  try {
    const leads = await rankWarmLeads(authCtx.tenantId, { limit, sinceDays });
    return NextResponse.json({ leads });
  } catch (err) {
    console.error("warm-leads/scan failed", err);
    // Brief §4.4 Severity 1 — zero warm leads is an expected state for
    // brand-new Gmail accounts, not a failure. Return [] rather than 500.
    return NextResponse.json({ leads: [] });
  }
}
