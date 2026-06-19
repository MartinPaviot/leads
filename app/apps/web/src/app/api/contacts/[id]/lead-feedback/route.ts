import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { withLeadFeedback } from "@/lib/inbound/lead-status";

/**
 * POST /api/contacts/:id/lead-feedback — human-in-the-loop correction for the
 * inbound-lead funnel (tranche 3, see _specs/inbound-lead-recognition/).
 *
 * The user marks a surfaced contact as "not a lead" (or re-confirms it as a
 * lead). This verdict ALWAYS overrides the deterministic + LLM stages (the
 * Lightfield data-approval principle). Stored on contacts.properties
 * .leadFeedback (jsonb, no migration); read by rankWarmLeads and the
 * hot-inbounds route to hide/keep the contact.
 *
 * Tenant-scoped read and write. Write access is already gated upstream by the
 * role middleware (a viewer can't POST).
 */
type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteCtx) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { isLead?: boolean; reason?: string };
  if (typeof body.isLead !== "boolean") {
    return NextResponse.json({ error: "isLead (boolean) required" }, { status: 400 });
  }

  const [contact] = await db
    .select({ id: contacts.id, properties: contacts.properties })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, id),
        eq(contacts.tenantId, authCtx.tenantId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 300)
      : null;

  const properties = withLeadFeedback(
    contact.properties as Record<string, unknown> | null,
    { isLead: body.isLead, at: new Date().toISOString(), reason },
  );

  await db
    .update(contacts)
    .set({ properties })
    .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)));

  return NextResponse.json({ ok: true, isLead: body.isLead });
}
