/**
 * POST /api/icps/reorder — { orderedIds: string[] }
 *
 * Phase 1 (_specs/icp-unification R4.2): the numeric priority input is
 * gone from the UI — the list ORDER is the priority. Persists
 * priority = index for the tenant's non-deleted profiles, re-derives
 * the flats mirror (rank 1 may have changed) and fires the recompute
 * (primary-ICP resolution depends on priority).
 *
 * Members allowed (R4.10). The payload must cover exactly the tenant's
 * non-deleted profiles — a stale drag (profile created/deleted in
 * another tab) is rejected instead of silently mis-ranking.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { icps } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { syncRankOneMirror } from "@/lib/icp/mirror";
import { inngest } from "@/inngest/client";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { orderedIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orderedIds = Array.isArray(body.orderedIds)
    ? body.orderedIds.filter((x): x is string => typeof x === "string")
    : [];
  if (orderedIds.length === 0) {
    return Response.json({ error: "orderedIds array required" }, { status: 400 });
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    return Response.json({ error: "orderedIds contains duplicates" }, { status: 400 });
  }

  const existing = await db
    .select({ id: icps.id })
    .from(icps)
    .where(and(eq(icps.tenantId, authCtx.tenantId), isNull(icps.deletedAt)));
  const existingIds = new Set(existing.map((r) => r.id));
  if (
    existingIds.size !== orderedIds.length ||
    orderedIds.some((id) => !existingIds.has(id))
  ) {
    return Response.json(
      { error: "orderedIds must contain exactly the tenant's profiles — reload and retry" },
      { status: 409 },
    );
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(icps)
        .set({ priority: i, updatedAt: sql`now()` })
        .where(and(eq(icps.id, orderedIds[i]), eq(icps.tenantId, authCtx.tenantId)));
    }
  });

  await syncRankOneMirror(authCtx.tenantId);
  inngest
    .send({ name: "icp/recompute-tenant", data: { tenantId: authCtx.tenantId } })
    .catch(() => {});

  return Response.json({ success: true, count: orderedIds.length });
}
