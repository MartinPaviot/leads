import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { analyzeWinLoss } from "@/lib/analysis/win-loss-engine";

/**
 * GET /api/deals/[id]/win-loss
 *
 * Returns the cached win/loss analysis for a closed deal, or runs
 * it on-demand if not yet analyzed.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [deal] = await db
      .select({
        stage: deals.stage,
        name: deals.name,
        properties: deals.properties,
      })
      .from(deals)
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)))
      .limit(1);

    if (!deal) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    if (deal.stage !== "won" && deal.stage !== "lost") {
      return Response.json(
        { error: "Win/loss analysis is only available for closed deals" },
        { status: 400 },
      );
    }

    // Return cached analysis if available
    const props = (deal.properties || {}) as Record<string, unknown>;
    if (props.winLossAnalysis) {
      return Response.json({
        dealName: deal.name,
        cachedAt: props.winLossAnalyzedAt,
        analysis: props.winLossAnalysis,
      });
    }

    // Run analysis on-demand
    const analysis = await analyzeWinLoss(id, authCtx.tenantId);
    return Response.json({
      dealName: deal.name,
      analysis,
    });
  } catch (error) {
    console.error("Win/loss analysis failed:", error);
    return Response.json(
      { error: "Failed to run win/loss analysis" },
      { status: 500 },
    );
  }
}
