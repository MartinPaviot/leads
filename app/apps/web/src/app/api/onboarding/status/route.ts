import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies, contacts, authAccounts, tenants, authUsers } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { hasUsableIcp, type TenantSettings } from "@/lib/config/tenant-settings";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [accountCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)));

  const [contactCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(and(eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));

  // Check if Google OAuth is connected
  const [googleAccount] = await db
    .select({ userId: authAccounts.userId })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.userId, authCtx.userId),
        eq(authAccounts.provider, "google")
      )
    )
    .limit(1);

  // Check if Microsoft OAuth is connected
  const [msAccount] = await db
    .select({ userId: authAccounts.userId })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.userId, authCtx.userId),
        eq(authAccounts.provider, "microsoft-entra-id")
      )
    )
    .limit(1);

  // Check onboarding completion in tenant settings
  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, authCtx.tenantId));

  const settings = (tenant?.settings || {}) as Record<string, unknown>;
  const ts = (tenant?.settings || {}) as TenantSettings;
  const onboardingCompleted = !!settings.onboardingCompleted;
  const rawCurrentStep =
    typeof settings.onboardingCurrentStep === "string"
      ? settings.onboardingCurrentStep
      : null;
  // "building" is transient — the async TAM build runs via Inngest and isn't
  // something the user can usefully resume mid-flight. Snap them back to
  // "icp" so they can re-submit and re-trigger.
  const onboardingCurrentStep =
    rawCurrentStep === "building" ? "icp" : rawCurrentStep;

  const accounts = Number(accountCount?.count || 0);
  const contactTotal = Number(contactCount?.count || 0);
  const isNew = accounts === 0 && contactTotal === 0;
  const hasGoogle = !!googleAccount;
  const hasMicrosoft = !!msAccount;

  // Get user email and name for domain extraction + pre-fill
  const [authUser] = await db
    .select({ email: authUsers.email, name: authUsers.name })
    .from(authUsers)
    .where(eq(authUsers.id, authCtx.userId))
    .limit(1);

  // A workspace that is already in use does not need the onboarding modal:
  // it would re-collect what's set and (worse) a blank confirmation card
  // could overwrite it. "In use" = has accounts OR a usable ICP. This is
  // true for the founder who set up their ICP AND for teammates invited
  // into an already-configured workspace, so it replaces the old
  // invite-scoped suppression with one rule for everyone. A genuinely
  // fresh tenant (no accounts, no ICP, not completed) still gets the
  // modal. `hasUsableIcp` reads the flat target* keys the rank-1 ICP
  // profile mirrors.
  const established = accounts > 0 || hasUsableIcp(ts);

  return Response.json({
    isNew,
    accounts,
    contacts: contactTotal,
    hasGoogle,
    hasMicrosoft,
    hasEmail: hasGoogle || hasMicrosoft,
    needsOnboarding: !onboardingCompleted && !established,
    onboardingCurrentStep,
    email: authUser?.email,
    name: authUser?.name || null,
    // WS-0: exposed for client-side PostHog `distinct_id`. Every analytics
    // call from the wizard uses this stable internal user ID so events
    // correlate with the server-side ttfaa_started emission.
    userId: authCtx.userId,
    // Existing config snapshot — the onboarding card seeds itself from this
    // so it shows what the tenant already has (instead of a blank "here's
    // what I picked up about you") and a no-edit confirm re-sends the real
    // values rather than wiping them.
    companyDomain: ts.companyDomain ?? "",
    productDescription: ts.productDescription ?? "",
    aiTone: ts.aiTone ?? "Direct",
    targeting: {
      industries: ts.targetIndustries ?? [],
      keywords: ts.targetKeywords ?? [],
      companySizes: ts.targetCompanySizes ?? [],
      geographies: ts.targetGeographies ?? [],
      excludeGeographies: ts.excludeGeographies ?? [],
      technologies: ts.targetTechnologies ?? [],
      revenueMin: ts.targetRevenueMin ?? null,
      revenueMax: ts.targetRevenueMax ?? null,
      fundingRecencyDays: ts.fundingRecencyDays ?? null,
      totalFundingMin: ts.totalFundingMin ?? null,
      totalFundingMax: ts.totalFundingMax ?? null,
      minJobOpenings: ts.minJobOpenings ?? null,
      hiringTitles: ts.hiringTitles ?? [],
      targetSeniorities: ts.targetSeniorities ?? [],
      targetDepartments: ts.targetDepartments ?? [],
    },
  });
}
