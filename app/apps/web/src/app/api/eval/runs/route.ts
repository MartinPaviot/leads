import { withAuthRLS, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { evalRuns } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { runEval } from "@/lib/agents/eval-runner";

export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const adminCheck = requireAdmin(authCtx);
    if (adminCheck) return adminCheck;

    const runs = await db.select().from(evalRuns)
      .where(eq(evalRuns.tenantId, authCtx.tenantId))
      .orderBy(desc(evalRuns.createdAt))
      .limit(50);

    return Response.json({ runs });
  });
}

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const adminCheck = requireAdmin(authCtx);
    if (adminCheck) return adminCheck;

    const { datasetId, model, graderModel } = await req.json();
    if (!datasetId) return Response.json({ error: "datasetId is required" }, { status: 400 });

    const [run] = await db.insert(evalRuns).values({
      tenantId: authCtx.tenantId,
      datasetId,
      model: model || "claude-sonnet-4-6",
      graderModel: graderModel || "gpt-4o-mini",
      status: "pending",
    }).returning();

    // Start eval in background (fire async, don't await)
    runEval(run.id, datasetId, authCtx.tenantId).catch(err => {
      console.error("Eval run failed:", err);
    });

    return Response.json({ run }, { status: 201 });
  });
}
