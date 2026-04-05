import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) return Response.json({ error: "Workspace not found" }, { status: 404 });

    const s = (tenant.settings || {}) as Record<string, unknown>;
    return Response.json({
      contactCreationMode: s.contactCreationMode || "selective",
      backsyncRange: s.backsyncRange || "3m",
      doNotTrackDomains: s.doNotTrackDomains || [],
    });
  } catch (error) {
    console.error("Failed to fetch privacy settings:", error);
    return Response.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const body = await req.json();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) return Response.json({ error: "Workspace not found" }, { status: 404 });

    const current = (tenant.settings || {}) as Record<string, unknown>;
    const updates = { ...current };

    if (body.contactCreationMode !== undefined) updates.contactCreationMode = body.contactCreationMode;
    if (body.backsyncRange !== undefined) updates.backsyncRange = body.backsyncRange;
    if (body.doNotTrackDomains !== undefined) updates.doNotTrackDomains = body.doNotTrackDomains;

    await db.update(tenants).set({ settings: updates, updatedAt: new Date() }).where(eq(tenants.id, authCtx.tenantId));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update privacy settings:", error);
    return Response.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
