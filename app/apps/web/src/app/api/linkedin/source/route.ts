import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { readUnipileConfig, type LinkedInSearchApi, type LinkedInSearchCategory } from "@/lib/providers/unipile/http";
import { sourceFromSalesNav } from "@/lib/linkedin/sales-nav-sourcing";
import logger from "@/lib/observability/logger";

/**
 * POST /api/linkedin/source — spec 36 (T11), the user-facing trigger that was
 * missing: turn the connected LinkedIn/Sales-Nav seat into TAM rows.
 *
 * v1 "paste a Sales-Nav search URL": the founder builds a precise search in
 * LinkedIn's own Sales Navigator UI and pastes the URL (no filter-id resolver
 * needed yet); we also accept free-text `keywords`. We run the search AS the
 * connected seat (ids are viewer-scoped) and upsert every hit through the
 * canonical layer (provider=unipile), so sourced rows dedup with Apollo and
 * their linkedin_url matches the seat's relations → warm-path graph.
 *
 * Body: { url?: string; keywords?: string; category?: "people"|"companies"; maxResults?: number }
 *   - one of `url` / `keywords` is required.
 * Returns: { ok, searched, accountsUpserted, contactsUpserted, skippedNoIdentity }
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

  // The connected seat is the search viewer. Prefer this user's connected seat;
  // fall back to any connected seat in the tenant (a shared SDR seat).
  const rows = await db
    .select({
      id: linkedinAccount.id,
      status: linkedinAccount.status,
      unipileAccountId: linkedinAccount.unipileAccountId,
      seatType: linkedinAccount.seatType,
      userId: linkedinAccount.userId,
    })
    .from(linkedinAccount)
    .where(eq(linkedinAccount.tenantId, authCtx.tenantId))
    .orderBy(desc(linkedinAccount.updatedAt));

  const seat =
    rows.find((r) => r.status === "connected" && r.unipileAccountId && r.userId === authCtx.userId) ??
    rows.find((r) => r.status === "connected" && r.unipileAccountId) ??
    null;

  if (!seat || !seat.unipileAccountId) {
    return NextResponse.json(
      { error: "Connect a LinkedIn / Sales Navigator seat first (Settings → Sending infrastructure)." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    keywords?: string;
    category?: LinkedInSearchCategory;
    maxResults?: number;
  };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const keywords = typeof body.keywords === "string" ? body.keywords.trim() : "";
  if (!url && !keywords) {
    return NextResponse.json(
      { error: "Provide a Sales Navigator search URL or keywords." },
      { status: 400 },
    );
  }

  // Run the search with the API tier the seat actually has. A classic seat
  // can't use the sales_navigator endpoint, so never force it.
  const api: LinkedInSearchApi =
    seat.seatType === "sales_navigator" ? "sales_navigator" : seat.seatType === "recruiter" ? "recruiter" : "classic";
  const category: LinkedInSearchCategory = body.category === "companies" ? "companies" : "people";
  const maxResults = Math.min(500, Math.max(1, Number(body.maxResults) || 100));

  try {
    const result = await sourceFromSalesNav({
      tenantId: authCtx.tenantId,
      unipileAccountId: seat.unipileAccountId,
      query: { api, category, ...(url ? { url } : {}), ...(keywords ? { keywords } : {}) },
      maxResults,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("linkedin/source: sourcing failed", { tenantId: authCtx.tenantId, err });
    return NextResponse.json(
      { error: "LinkedIn sourcing failed. Check the seat is still connected and the search URL is valid." },
      { status: 502 },
    );
  }
}
