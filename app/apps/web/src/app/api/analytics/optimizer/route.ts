import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { optimizerProposal } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

/**
 * GET /api/analytics/optimizer?week=<yyyy-mm-dd> — spec 31. The weekly
 * optimizer's reviewed proposal queue (the gated decisions a human approves).
 * Tenant-scoped, read-only. Proposals are produced by the weekly-optimizer cron;
 * in observe-only mode every row is route=gated/watch (none auto-applied).
 */
export async function GET(request: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const week = new URL(request.url).searchParams.get("week");
  const conds = [eq(optimizerProposal.tenantId, authCtx.tenantId)];
  if (week) conds.push(eq(optimizerProposal.week, week));

  try {
    const rows = await db
      .select()
      .from(optimizerProposal)
      .where(and(...conds))
      .orderBy(desc(optimizerProposal.createdAt));
    return Response.json({ proposals: rows });
  } catch (error) {
    console.error("Failed to read optimizer proposals:", error);
    return Response.json({ error: "Failed to read optimizer proposals" }, { status: 500 });
  }
}
