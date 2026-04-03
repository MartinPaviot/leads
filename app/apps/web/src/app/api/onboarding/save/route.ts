import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();

  // Get current tenant settings
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, authCtx.tenantId));

  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const currentSettings = (tenant.settings || {}) as Record<string, unknown>;

  // Build updated settings based on what step sent
  const updates: Record<string, unknown> = { ...currentSettings };

  if (data.step === "welcome") {
    updates.onboardingFullName = data.fullName;
    updates.onboardingCompanyName = data.companyName;
    updates.onboardingRole = data.role;

    // Also update tenant name and user name
    if (data.companyName) {
      await db.update(tenants).set({ name: data.companyName }).where(eq(tenants.id, authCtx.tenantId));
    }
    if (data.fullName) {
      const parts = data.fullName.trim().split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      await db.update(users).set({ firstName, lastName }).where(eq(users.id, authCtx.appUserId));
    }
  }

  if (data.step === "product") {
    updates.productDescription = data.productDesc;
    updates.salesMotion = data.salesMotion;
    updates.aiTone = data.aiTone;
    updates.primaryChallenge = data.challenge;
  }

  if (data.step === "connect") {
    updates.emailProvider = data.emailProvider;
  }

  if (data.step === "icp") {
    updates.targetIndustries = data.industries;
    updates.targetCompanySizes = data.companySizes;
    updates.targetRoles = data.targetRoles;
    updates.targetGeographies = data.geographies;
  }

  if (data.step === "complete") {
    updates.onboardingCompleted = true;
    updates.onboardingCompletedAt = new Date().toISOString();
  }

  await db.update(tenants).set({
    settings: updates,
    updatedAt: new Date(),
  }).where(eq(tenants.id, authCtx.tenantId));

  return Response.json({ ok: true });
}
