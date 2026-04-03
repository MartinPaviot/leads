import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { evalDatasets, evalCases } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const datasets = await db.select({
    id: evalDatasets.id,
    name: evalDatasets.name,
    description: evalDatasets.description,
    createdAt: evalDatasets.createdAt,
    caseCount: sql<number>`(SELECT count(*) FROM eval_cases WHERE dataset_id = ${evalDatasets.id})`,
  }).from(evalDatasets)
    .where(eq(evalDatasets.tenantId, authCtx.tenantId))
    .orderBy(desc(evalDatasets.createdAt));

  return Response.json({ datasets });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description } = await req.json();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const [dataset] = await db.insert(evalDatasets).values({
    tenantId: authCtx.tenantId,
    name,
    description,
  }).returning();

  return Response.json({ dataset }, { status: 201 });
}
