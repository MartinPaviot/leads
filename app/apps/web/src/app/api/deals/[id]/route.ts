import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [deal] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!deal) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    return Response.json({ deal });
  } catch (error) {
    console.error("Failed to fetch deal:", error);
    return Response.json({ error: "Failed to fetch deal" }, { status: 500 });
  }
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

  try {
    const body = await req.json();
    const { name, stage, value, summary, expectedCloseDate, companyId, contactId, ownerId, closeReason } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updates.name = name.trim();
    if (stage) updates.stage = stage;
    if (value !== undefined) updates.value = value ? parseInt(value) : null;
    if (summary !== undefined) updates.summary = summary;
    if (expectedCloseDate !== undefined) updates.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;
    if (companyId !== undefined) updates.companyId = companyId || null;
    if (contactId !== undefined) updates.contactId = contactId || null;
    if (ownerId !== undefined) updates.ownerId = ownerId || null;

    // Y6 — when a close reason is supplied (won/lost stage change), merge
    // it into deal.properties alongside `closedAt` so the win-rate
    // dashboard can aggregate without touching the main columns. We
    // fetch existing properties first to preserve anything the user set
    // earlier (custom fields, manual tags).
    if (closeReason && typeof closeReason === "object") {
      const reason = typeof closeReason.reason === "string" ? closeReason.reason : null;
      const note = typeof closeReason.note === "string" ? closeReason.note : null;
      if (reason) {
        const [existing] = await db
          .select({ properties: deals.properties })
          .from(deals)
          .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
          .limit(1);
        const priorProps = (existing?.properties ?? {}) as Record<string, unknown>;
        updates.properties = {
          ...priorProps,
          closeReason: reason,
          closeReasonNote: note,
          closedAt: new Date().toISOString(),
        };
      }
    }

    const [updated] = await db
      .update(deals)
      .set(updates)
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
      .returning();

    if (!updated) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    return Response.json({ deal: updated });
  } catch (error) {
    console.error("Failed to update deal:", error);
    return Response.json({ error: "Failed to update deal" }, { status: 500 });
  }
}
