/**
 * GET /api/calls/queue
 *
 * Returns the prioritised list of contacts to call right now. Already
 * filtered for DNC + quiet hours + missing phone — the UI just renders.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { buildQueue } from "@/lib/voice/queue";

export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    // Optional ?accounts=id1,id2 — scope the queue to a selection pushed
    // from the Accounts list. Blank/whitespace ids are dropped; an empty
    // result falls back to the global queue rather than an empty screen.
    const accountsParam = url.searchParams.get("accounts");
    const companyIds = accountsParam
      ? accountsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const items = await buildQueue(authCtx.tenantId, limit, {
      companyIds: companyIds.length > 0 ? companyIds : undefined,
      ownerId: authCtx.appUserId, // territory exclusivity: hide other reps' active accounts
    });
    return Response.json({ calls: items });
  });
}
