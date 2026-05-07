import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { evalCases, evalDatasets } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Verify that the dataset in the URL belongs to the caller's tenant
 * before touching its cases. `evalCases` rows only carry a `datasetId`
 * (no direct `tenantId`), so without this guard a tenant-A admin could
 * read or write tenant-B cases by knowing a dataset id.
 */
async function assertDatasetInTenant(
  datasetId: string,
  tenantId: string
): Promise<boolean> {
  const [dataset] = await db
    .select({ id: evalDatasets.id })
    .from(evalDatasets)
    .where(
      and(eq(evalDatasets.id, datasetId), eq(evalDatasets.tenantId, tenantId))
    )
    .limit(1);
  return !!dataset;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;
  const { id } = await params;

  if (!(await assertDatasetInTenant(id, authCtx.tenantId))) {
    return Response.json({ error: "Dataset not found" }, { status: 404 });
  }

  const cases = await db.select().from(evalCases)
    .where(eq(evalCases.datasetId, id))
    .orderBy(desc(evalCases.createdAt));

  return Response.json({ cases });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;
  const { id } = await params;

  if (!(await assertDatasetInTenant(id, authCtx.tenantId))) {
    return Response.json({ error: "Dataset not found" }, { status: 404 });
  }

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
