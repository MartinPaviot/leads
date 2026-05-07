import { db } from "@/db";
import { knowledgeEntries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { embedKnowledgeEntry } from "./retrieval";
import logger from "@/lib/observability/logger";

interface SeedEntry {
  title: string;
  category: string;
  content: string;
}

/**
 * Generate Knowledge entries from onboarding settings.
 * Called after onboarding completion to give skills a baseline context.
 * Idempotent — skips entries with matching contentHash.
 */
export async function seedKnowledgeFromOnboarding(
  tenantId: string,
  userId: string,
): Promise<{ created: number; skipped: number }> {
  const settings = await getTenantSettings(tenantId);
  const entries: SeedEntry[] = [];

  if (settings.productDescription) {
    entries.push({
      title: "Product Description",
      category: "product",
      content: settings.productDescription,
    });
  }

  const icpParts: string[] = [];
  if (settings.targetIndustries?.length) {
    icpParts.push(`Target industries: ${settings.targetIndustries.join(", ")}`);
  }
  if (settings.targetCompanySizes?.length) {
    icpParts.push(`Target company sizes: ${settings.targetCompanySizes.join(", ")}`);
  }
  if (settings.targetGeographies?.length) {
    icpParts.push(`Target geographies: ${settings.targetGeographies.join(", ")}`);
  }
  const targetRoles = settings.targetRoles;
  if (targetRoles) {
    const rolesText = Array.isArray(targetRoles)
      ? targetRoles.join(", ")
      : String(targetRoles);
    icpParts.push(`Target buyer roles: ${rolesText}`);
  }
  if (settings.salesMotion) {
    icpParts.push(`Sales motion: ${settings.salesMotion}`);
  }
  if (icpParts.length > 0) {
    entries.push({
      title: "Ideal Customer Profile",
      category: "icp",
      content: icpParts.join("\n"),
    });
  }

  if (settings.onboardingCompanyName) {
    const companyParts = [`Company name: ${settings.onboardingCompanyName}`];
    if (settings.companyDomain) companyParts.push(`Domain: ${settings.companyDomain}`);
    if (settings.onboardingRole) companyParts.push(`User role: ${settings.onboardingRole}`);
    if (settings.primaryChallenge) companyParts.push(`Primary challenge: ${settings.primaryChallenge}`);
    entries.push({
      title: "Company Context",
      category: "context",
      content: companyParts.join("\n"),
    });
  }

  if (entries.length === 0) return { created: 0, skipped: 0 };

  let created = 0;
  let skipped = 0;

  for (const entry of entries) {
    const contentHash = createHash("sha256")
      .update(entry.content.trim())
      .digest("hex");

    const [existing] = await db
      .select({ id: knowledgeEntries.id })
      .from(knowledgeEntries)
      .where(
        and(
          eq(knowledgeEntries.tenantId, tenantId),
          eq(knowledgeEntries.contentHash, contentHash),
          eq(knowledgeEntries.isActive, true),
        ),
      )
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    const [inserted] = await db
      .insert(knowledgeEntries)
      .values({
        tenantId,
        createdBy: userId,
        scope: "workspace",
        title: entry.title,
        category: entry.category,
        content: entry.content.trim(),
        contentHash,
      })
      .returning();

    embedKnowledgeEntry(tenantId, inserted.id, inserted.title, inserted.content)
      .catch((e) => logger.warn("Knowledge seed embedding failed", { error: String(e) }));

    created++;
  }

  logger.info("Knowledge seeded from onboarding", { tenantId, created, skipped });
  return { created, skipped };
}
