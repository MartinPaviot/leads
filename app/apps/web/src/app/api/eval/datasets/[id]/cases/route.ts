import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { evalCases, evalDatasets } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const cases = await db.select().from(evalCases)
    .where(eq(evalCases.datasetId, id))
    .orderBy(desc(evalCases.createdAt));

  return Response.json({ cases });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { input, expectedOutput, context, tags } = await req.json();
  if (!input) return Response.json({ error: "input is required" }, { status: 400 });

  const [evalCase] = await db.insert(evalCases).values({
    datasetId: id,
    input,
    expectedOutput,
    context,
    tags: tags || [],
  }).returning();

  return Response.json({ case: evalCase }, { status: 201 });
}
