import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { readUnipileConfig, listSalesNavCollections } from "@/lib/providers/unipile/http";
import { resolveConnectedSeat } from "@/lib/linkedin/seat";
import logger from "@/lib/observability/logger";

/**
 * GET /api/linkedin/collections — the connected Sales-Nav seat's OWN saved
 * collections (lead lists, account lists, saved searches, buyer personas), so the
 * sourcing UI can offer them as pickers: "source from my 'Recommended Leads'
 * list" or "re-run my saved search". Viewer-scoped (resolved as the seat), so the
 * ids are usable directly in a /linkedin/source body.
 *
 * Returns { ok, leadLists, accountLists, savedSearches, personas } — each an
 * array of { id, title }. Empty arrays when the seat isn't Sales-Navigator (the
 * resolver types don't exist on Classic) or has no saved collections.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = readUnipileConfig();
  if (!cfg) return NextResponse.json({ ok: true, leadLists: [], accountLists: [], savedSearches: [], personas: [] });

  const seat = await resolveConnectedSeat(authCtx.tenantId, authCtx.userId);
  if (!seat) {
    return NextResponse.json({ ok: true, leadLists: [], accountLists: [], savedSearches: [], personas: [] });
  }

  try {
    const collections = await listSalesNavCollections(cfg, seat.unipileAccountId);
    return NextResponse.json({ ok: true, ...collections });
  } catch (err) {
    logger.warn("linkedin/collections: list failed (non-fatal)", { tenantId: authCtx.tenantId, err });
    return NextResponse.json({ ok: true, leadLists: [], accountLists: [], savedSearches: [], personas: [] });
  }
}
