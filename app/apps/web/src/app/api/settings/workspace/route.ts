import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit-log";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) {
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    // Merge primary domain from onboarding into companyDomains
    const primaryDomain = (settings.companyDomain as string) || "";
    const extraDomains = (settings.companyDomains as string[]) || [];
    const allDomains = primaryDomain
      ? [primaryDomain, ...extraDomains.filter((d) => d !== primaryDomain)]
      : extraDomains;

    return Response.json({
      name: tenant.name,
      companyDomain: primaryDomain,
      companyDomains: allDomains,
      agentApprovalMode: settings.agentApprovalMode || "ask",
    });
  } catch (error) {
    console.error("Failed to fetch workspace settings:", error);
    return Response.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const body = await req.json();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) {
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    const currentSettings = (tenant.settings || {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = { ...currentSettings };

    if (body.name !== undefined) {
      await db.update(tenants).set({ name: body.name.trim() }).where(eq(tenants.id, authCtx.tenantId));
    }
    if (body.companyDomain !== undefined) updates.companyDomain = body.companyDomain;
    if (body.companyDomains !== undefined) {
      // Keep companyDomains in sync: strip the primary domain from the array
      const primary = (body.companyDomain ?? updates.companyDomain ?? "") as string;
      updates.companyDomains = primary
        ? (body.companyDomains as string[]).filter((d: string) => d !== primary)
        : body.companyDomains;
    }
    if (body.agentApprovalMode !== undefined) updates.agentApprovalMode = body.agentApprovalMode;

    await db.update(tenants).set({ settings: updates, updatedAt: new Date() }).where(eq(tenants.id, authCtx.tenantId));

    // Build a changes record for the audit log
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (body.name !== undefined) {
      changes.name = { old: tenant.name, new: body.name.trim() };
    }
    if (body.companyDomains !== undefined) {
      changes.companyDomains = { old: currentSettings.companyDomains, new: body.companyDomains };
    }
    if (body.agentApprovalMode !== undefined) {
      changes.agentApprovalMode = { old: currentSettings.agentApprovalMode, new: body.agentApprovalMode };
    }

    await logAudit({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      action: "update",
      entityType: "workspace",
      entityId: authCtx.tenantId,
      changes,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update workspace settings:", error);
    return Response.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
