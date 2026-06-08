/**
 * GET /api/opportunities/[id]/related-counts
 *
 * Live counts of the data related to a deal (activities, notes, tasks) —
 * powers the cascade-delete modal's checkboxes.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getDealRelatedCounts } from "@/lib/deals/cascade-delete";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)))
    .limit(1);
  if (!deal) return Response.json({ error: "Not found" }, { status: 404 });

  const counts = await getDealRelatedCounts(authCtx.tenantId, id);
  return Response.json({ counts });
}
