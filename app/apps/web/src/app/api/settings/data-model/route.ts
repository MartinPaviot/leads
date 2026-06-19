import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) {
      return Response.json({ fields: [] });
    }

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    return Response.json({ fields: settings.customFields || [] });
  } catch (error) {
    console.error("Failed to fetch custom fields:", error);
    return Response.json({ error: "Failed to fetch fields" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;
  // CLE-12 — belt-and-braces matrix gate on the fresh DB role (settings:write).
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  try {
    const { fields } = await req.json();

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) {
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    await db.update(tenants).set({
      settings: { ...settings, customFields: fields },
    }).where(eq(tenants.id, authCtx.tenantId));

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to save custom fields:", error);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }
}
