/**
 * GET /api/accounts/[id]/related-counts
 *
 * Live counts of the data related to an account (contacts, deals, activities,
 * notes, tasks) — powers the cascade-delete modal's checkboxes.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getCompanyRelatedCounts } from "@/lib/accounts/cascade-delete";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [account] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
    .limit(1);
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });

  const counts = await getCompanyRelatedCounts(authCtx.tenantId, id);
  return Response.json({ counts });
}
