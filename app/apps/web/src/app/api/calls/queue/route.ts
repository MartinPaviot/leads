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
    const items = await buildQueue(authCtx.tenantId, limit);
    return Response.json({ calls: items });
  });
}
