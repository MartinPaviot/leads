import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { evalDatasets, evalCases } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const datasets = await db.select({
    id: evalDatasets.id,
    name: evalDatasets.name,
    description: evalDatasets.description,
    createdAt: evalDatasets.createdAt,
    // Qualify the outer ref literally: ${evalDatasets.id} renders an
    // unqualified "id" that binds to eval_cases.id inside the subquery
    // (eval_cases has its own id), making every count 0. See the same
    // fix in api/icps/route.ts.
    caseCount: sql<number>`(SELECT count(*) FROM eval_cases WHERE dataset_id = "eval_datasets"."id")`,
  }).from(evalDatasets)
    .where(eq(evalDatasets.tenantId, authCtx.tenantId))
    .orderBy(desc(evalDatasets.createdAt));

  return Response.json({ datasets });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const { name, description } = await req.json();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const [dataset] = await db.insert(evalDatasets).values({
    tenantId: authCtx.tenantId,
    name,
    description,
  }).returning();

  return Response.json({ dataset }, { status: 201 });
}
