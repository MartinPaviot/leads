import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { LIFECYCLE_STAGES, LIFECYCLE_COLORS, type LifecycleStage } from "@/lib/analytics/lifecycle";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { stage } = body;

    if (!stage || !LIFECYCLE_STAGES.includes(stage)) {
      return Response.json(
        {
          error: "Invalid lifecycle stage",
          validStages: LIFECYCLE_STAGES,
        },
        { status: 400 }
      );
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.id, id),
          eq(companies.tenantId, authCtx.tenantId),
          isNull(companies.deletedAt),
        ),
      )
      .limit(1);

    if (!company) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    const currentProperties = (company.properties || {}) as Record<string, unknown>;
    await db
      .update(companies)
      .set({
        properties: { ...currentProperties, lifecycle: stage },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(companies.id, id),
          eq(companies.tenantId, authCtx.tenantId),
          isNull(companies.deletedAt),
        ),
      );

    return Response.json({
      success: true,
      stage,
      colors: LIFECYCLE_COLORS[stage as LifecycleStage],
    });
  } catch (error) {
    console.error("Failed to update lifecycle stage:", error);
    return Response.json({ error: "Failed to update lifecycle stage" }, { status: 500 });
  }
}
