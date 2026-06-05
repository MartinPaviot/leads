import { getAuthContext } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/db";
import { deals, companies, activities } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { logAudit } from "@/lib/infra/audit-log";
import { softDelete } from "@/lib/infra/soft-delete";
import { apiError } from "@/lib/infra/api-errors";
import { inngest } from "@/inngest/client";
import { z } from "zod";

const VALID_STAGES = ["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"] as const;

const updateDealSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  stage: z.enum(VALID_STAGES).optional(),
  value: z.union([z.number(), z.string(), z.null()]).optional(),
  summary: z.string().max(5000).optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  closeDate: z.string().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)))
    .limit(1);

  if (!deal) {
    return apiError("NOT_FOUND", "Deal not found");
  }

  // Get company name
  let companyName = null;
  if (deal.companyId) {
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(and(eq(companies.id, deal.companyId), eq(companies.tenantId, authCtx.tenantId)))
      .limit(1);
    companyName = company?.name || null;
  }

  // G8: Get activity timeline for this deal
  const timeline = await db
    .select({
      id: activities.id,
      activityType: activities.activityType,
      channel: activities.channel,
      direction: activities.direction,
      summary: activities.summary,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .where(and(eq(activities.entityId, id), eq(activities.tenantId, authCtx.tenantId)))
    .orderBy(desc(activities.occurredAt))
    .limit(50);

  return Response.json({
    deal: {
      id: deal.id,
      name: deal.name,
      stage: deal.stage,
      value: deal.value,
      summary: deal.summary,
      expectedCloseDate: deal.expectedCloseDate?.toISOString() || null,
      properties: deal.properties,
      companyName,
      companyId: deal.companyId,
      // Y2 — expose updatedAt so the detail page can compute
      // age-in-stage and render a stall banner without a second fetch.
      updatedAt: deal.updatedAt?.toISOString() || null,
    },
    timeline: timeline.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      channel: a.channel,
      direction: a.direction,
      summary: a.summary,
      occurredAt: a.occurredAt?.toISOString() || "",
    })),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const raw = await req.json();
  const parsed = updateDealSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid deal update", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const body = parsed.data;

  const [existing] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)))
    .limit(1);

  if (!existing) {
    return apiError("NOT_FOUND", "Deal not found");
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.stage !== undefined) updates.stage = body.stage;
  if (body.value !== undefined) updates.value = body.value ? parseInt(String(body.value)) : null;
  if (body.summary !== undefined) updates.summary = body.summary;
  if (body.expectedCloseDate !== undefined || body.closeDate !== undefined) {
    const dateStr = body.expectedCloseDate || body.closeDate;
    updates.expectedCloseDate = dateStr ? new Date(dateStr) : null;
  }
  if (body.companyId !== undefined) updates.companyId = body.companyId;
  if (body.contactId !== undefined) updates.contactId = body.contactId;

  if (Object.keys(updates).length === 0) {
    return apiError("VALIDATION_ERROR", "No fields to update");
  }

  const [updated] = await db
    .update(deals)
    .set(updates)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
    .returning();

  // Trigger win/loss analysis when deal is closed
  if (body.stage === "won" || body.stage === "lost") {
    void inngest.send({
      name: "deal/closed",
      data: { dealId: id, tenantId: authCtx.tenantId, outcome: body.stage },
    }).catch((err) => {
      console.warn("opportunities/[id]: win-loss analysis trigger failed (non-blocking)", err);
    });
  }

  return Response.json({ deal: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = requirePermission(authCtx.role, "deals:delete");
  if (denied) return denied;

  const { id } = await params;

  const [existing] = await db
    .select({ id: deals.id, name: deals.name })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)))
    .limit(1);

  if (!existing) {
    return apiError("NOT_FOUND", "Deal not found");
  }

  await softDelete("deals", id, authCtx.tenantId);

  await logAudit({
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    action: "delete",
    entityType: "deal",
    entityId: id,
    metadata: { name: existing.name, softDeleted: true },
  });

  return Response.json({ success: true, id });
}
