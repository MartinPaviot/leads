import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/infra/audit-log";
import { readApprovalMode } from "@/lib/guardrails/approval-mode";
import type { TenantSettings } from "@/lib/config/tenant-settings";
import { isValidWorkspaceLogoDataUrl, workspaceLogoUrl } from "@/lib/logo/workspace-logo";

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
      // WS-1 — expose the v2-coerced value so UI consumers never see
      // legacy strings leak out of the API even when the DB still
      // holds one (pre-migration tenants).
      agentApprovalMode: readApprovalMode(settings as TenantSettings),
      // Versioned serving URL (never the raw data URL — keep payloads small).
      logoUrl: workspaceLogoUrl(settings as TenantSettings),
      // Recording / notetaker channel (WS-1)
      settings: {
        recordingEnabled: settings.recordingEnabled ?? true,
        recordingBotName: settings.recordingBotName ?? "Elevay Notetaker",
        recordingPolicy: settings.recordingPolicy ?? "branded",
        recordingOptOutReason: settings.recordingOptOutReason ?? null,
        primaryDomain: settings.primaryDomain ?? primaryDomain ?? null,
        domainAliases: settings.domainAliases ?? [],
      },
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

  // Granular permission check (subsumes the old admin-only gate)
  const denied = requirePermission(authCtx.role, "settings:write");
  if (denied) return denied;

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
    if (body.agentApprovalMode !== undefined) {
      // WS-1 — coerce legacy values to v2 at write time. Legacy values
      // still work from older clients but every row we mutate lands as
      // clean v2 so post-migration data is consistent.
      const legacyMap: Record<string, string> = {
        auto: "auto-high-confidence",
        ask: "review-each",
        off: "review-each",
        manual: "review-each",
      };
      updates.agentApprovalMode =
        legacyMap[body.agentApprovalMode] ?? body.agentApprovalMode;
    }
    // WS-1 — dismissible transitional banner timestamp. Accept any ISO
    // string; empty / null resets the dismissal (useful for admins
    // reverting state during testing).
    if (body.ws1MigrationBannerDismissedAt !== undefined) {
      updates.ws1MigrationBannerDismissedAt =
        typeof body.ws1MigrationBannerDismissedAt === "string"
          ? body.ws1MigrationBannerDismissedAt
          : undefined;
    }

    // Recording / notetaker channel (WS-1)
    if (body.recordingEnabled !== undefined) updates.recordingEnabled = !!body.recordingEnabled;
    if (body.recordingBotName !== undefined) {
      const trimmed = String(body.recordingBotName).trim();
      if (trimmed.length > 0 && trimmed.length <= 60) updates.recordingBotName = trimmed;
    }
    if (body.recordingPolicy !== undefined) {
      const v = String(body.recordingPolicy);
      if (["branded", "always_silent", "per_meeting_choice"].includes(v)) {
        updates.recordingPolicy = v;
      }
    }
    if (body.recordingOptOutReason !== undefined) {
      updates.recordingOptOutReason = body.recordingOptOutReason
        ? String(body.recordingOptOutReason).slice(0, 80)
        : null;
    }
    // Privacy — default data visibility (O7)
    if (body.defaultDataVisibility !== undefined) {
      const v = String(body.defaultDataVisibility);
      if (["everyone", "team", "private"].includes(v)) {
        updates.defaultDataVisibility = v;
      }
    }
    if (body.primaryDomain !== undefined) {
      updates.primaryDomain = body.primaryDomain
        ? String(body.primaryDomain).trim().toLowerCase()
        : null;
    }
    if (body.domainAliases !== undefined && Array.isArray(body.domainAliases)) {
      updates.domainAliases = body.domainAliases
        .map((d: unknown) => String(d).trim().toLowerCase())
        .filter((d: string) => d.length > 0)
        .slice(0, 10);
    }
    // Workspace logo — small raster data URL (the client rasterizes any
    // input, SVG included, to ≤256px PNG/JPEG before upload). `null`
    // removes the logo. Raw SVG and oversize payloads are rejected
    // fail-closed so nothing scriptable or heavy lands in settings.
    if (body.logoDataUrl !== undefined) {
      if (body.logoDataUrl === null) {
        updates.logoDataUrl = null;
        updates.logoUpdatedAt = new Date().toISOString();
      } else if (typeof body.logoDataUrl === "string" && isValidWorkspaceLogoDataUrl(body.logoDataUrl)) {
        updates.logoDataUrl = body.logoDataUrl;
        updates.logoUpdatedAt = new Date().toISOString();
      } else {
        return Response.json(
          { error: "Logo must be a PNG, JPEG or WebP image under 300 KB" },
          { status: 400 },
        );
      }
    }

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
    if (body.logoDataUrl !== undefined) {
      // Booleans only — never write image bytes into the audit log.
      changes.logo = { old: !!currentSettings.logoDataUrl, new: !!body.logoDataUrl };
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
