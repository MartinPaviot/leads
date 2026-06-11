import { getAuthContext } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/db";
import { deals, companies, activities } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { getTenantMemberNames } from "@/lib/collision/member-names";
import { resolveActorName } from "@/lib/collision/actor-name";
import { logAudit } from "@/lib/infra/audit-log";
import { logDealEvent } from "@/lib/deals/log-deal-event";
import { apiError } from "@/lib/infra/api-errors";
import { cascadeSoftDeleteDeal, DEAL_CASCADE_TYPES, type DealCascadeType } from "@/lib/deals/cascade-delete";
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
  ownerId: z.string().uuid().optional().nullable(),
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
      actorType: activities.actorType,
      actorId: activities.actorId,
    })
    .from(activities)
    .where(and(eq(activities.entityId, id), eq(activities.tenantId, authCtx.tenantId)))
    .orderBy(desc(activities.occurredAt))
    .limit(50);

  // Attribute each user action to the member who did it (one members lookup).
  const memberNames = await getTenantMemberNames(authCtx.tenantId);

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
      // Owner (responsible member) so the detail page can show + reassign it.
      ownerId: deal.ownerId,
      ownerName: deal.ownerId ? (memberNames.get(deal.ownerId) ?? null) : null,
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
      actorName: resolveActorName(a.actorType, a.actorId, memberNames),
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
  if (body.ownerId !== undefined) updates.ownerId = body.ownerId || null;

  if (Object.keys(updates).length === 0) {
    return apiError("VALIDATION_ERROR", "No fields to update");
  }

  const [updated] = await db
    .update(deals)
    .set(updates)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
    .returning();

  // Journal the stage transition so the Activity feed and the deal timeline
  // see MANUAL moves (kanban drag, edit form), not only engine/chat ones.
  if (body.stage !== undefined && body.stage !== existing.stage) {
    const type =
      body.stage === "won" ? "deal_won" : body.stage === "lost" ? "deal_lost" : "deal_stage_changed";
    await logDealEvent({
      tenantId: authCtx.tenantId,
      dealId: id,
      type,
      actorType: "user",
      actorId: authCtx.appUserId,
      summary:
        type === "deal_won"
          ? "Deal won"
          : type === "deal_lost"
            ? "Deal lost"
            : `Stage changed from ${existing.stage} to ${body.stage}`,
      oldStage: existing.stage,
      newStage: body.stage,
      triggeredBy: "manual",
    });
  }

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

  // Optional cascade: also soft-delete selected related sets (the delete modal
  // sends the checked types). Body is absent for a plain deal delete.
  const body = (await req.json().catch(() => ({}))) as { cascade?: unknown };
  const cascade: DealCascadeType[] = Array.isArray(body.cascade)
    ? body.cascade.filter(
        (t): t is DealCascadeType => typeof t === "string" && (DEAL_CASCADE_TYPES as readonly string[]).includes(t),
      )
    : [];

  const [existing] = await db
    .select({ id: deals.id, name: deals.name })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)))
    .limit(1);

  if (!existing) {
    return apiError("NOT_FOUND", "Deal not found");
  }

  // Cascade the selected related sets first (soft-delete, recoverable), then
  // the deal itself. One shared timestamp for the deal AND its cascade so a
  // later restore brings back exactly the set deleted together.
  const deletedAt = new Date();
  const cascaded = cascade.length
    ? await cascadeSoftDeleteDeal(authCtx.tenantId, id, cascade, deletedAt)
    : {};

  await db
    .update(deals)
    .set({ deletedAt })
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)));

  await logAudit({
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    action: "delete",
    entityType: "deal",
    entityId: id,
    metadata: { name: existing.name, softDeleted: true, cascaded },
  });

  return Response.json({ success: true, id, cascaded });
}
