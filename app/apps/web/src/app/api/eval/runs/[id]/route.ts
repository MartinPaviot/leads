import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { evalRuns, evalResults, evalCases } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [run] = await db.select().from(evalRuns).where(eq(evalRuns.id, id)).limit(1);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  const results = await db.select({
    id: evalResults.id,
    caseId: evalResults.caseId,
    agentOutput: evalResults.agentOutput,
    score: evalResults.score,
    pass: evalResults.pass,
    graderReasoning: evalResults.graderReasoning,
    latencyMs: evalResults.latencyMs,
    toolCallsCount: evalResults.toolCallsCount,
    input: evalCases.input,
    expectedOutput: evalCases.expectedOutput,
    tags: evalCases.tags,
  }).from(evalResults)
    .innerJoin(evalCases, eq(evalResults.caseId, evalCases.id))
    .where(eq(evalResults.runId, id));

  return Response.json({ run, results });
}
