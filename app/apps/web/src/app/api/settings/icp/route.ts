import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deriveTargetRoles } from "@/lib/config/tenant-settings";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) return Response.json({ error: "Workspace not found" }, { status: 404 });

    const s = (tenant.settings || {}) as Record<string, unknown>;
    // BUG-WS0-008: return derived targetRoles so the UI always reflects
    // the current seniorities + departments combination.
    const settingsTyped = s as import("@/lib/config/tenant-settings").TenantSettings;
    return Response.json({
      productDescription: s.productDescription || "",
      salesMotion: s.salesMotion || "",
      primaryChallenge: s.primaryChallenge || "",
      aiTone: s.aiTone || "",
      targetIndustries: s.targetIndustries || [],
      targetCompanySizes: s.targetCompanySizes || [],
      targetRoles: deriveTargetRoles(settingsTyped),
      targetGeographies: s.targetGeographies || [],
      // Full Apollo filter surface — parity with the onboarding card so
      // every persisted filter is visible + editable post-onboarding.
      targetKeywords: s.targetKeywords || [],
      targetRevenueMin: s.targetRevenueMin ?? null,
      targetRevenueMax: s.targetRevenueMax ?? null,
      targetTechnologies: s.targetTechnologies || [],
      excludeGeographies: s.excludeGeographies || [],
      fundingRecencyDays: s.fundingRecencyDays ?? null,
      totalFundingMin: s.totalFundingMin ?? null,
      totalFundingMax: s.totalFundingMax ?? null,
      minJobOpenings: s.minJobOpenings ?? null,
      hiringTitles: s.hiringTitles || [],
    });
  } catch (error) {
    console.error("Failed to fetch ICP settings:", error);
    return Response.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // ICP is a workspace-level setting any team member configures (it drives
  // scoring / targeting / coaching) — not an admin-only surface. The
  // previous requireAdmin gate made non-admins fill the whole form then hit
  // a silent 403 "Failed to save". Removed.

  try {
    const body = await req.json();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) return Response.json({ error: "Workspace not found" }, { status: 404 });

    const current = (tenant.settings || {}) as Record<string, unknown>;
    const updates = { ...current };

    const fields = [
      "productDescription", "salesMotion", "primaryChallenge", "aiTone",
      "targetIndustries", "targetCompanySizes", "targetRoles", "targetGeographies",
      // Full Apollo filter surface (parity with onboarding card). Numeric
      // fields accept null to clear them.
      "targetKeywords", "targetRevenueMin", "targetRevenueMax",
      "targetTechnologies", "excludeGeographies", "fundingRecencyDays",
      "totalFundingMin", "totalFundingMax", "minJobOpenings", "hiringTitles",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }

    await db.update(tenants).set({ settings: updates, updatedAt: new Date() }).where(eq(tenants.id, authCtx.tenantId));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update ICP settings:", error);
    return Response.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
