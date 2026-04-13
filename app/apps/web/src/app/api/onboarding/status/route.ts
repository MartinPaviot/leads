import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { companies, contacts, authAccounts, tenants, authUsers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [accountCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(eq(companies.tenantId, authCtx.tenantId));

  const [contactCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(eq(contacts.tenantId, authCtx.tenantId));

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
  const onboardingCompleted = !!settings.onboardingCompleted;

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

  return Response.json({
    isNew,
    accounts,
    contacts: contactTotal,
    hasGoogle,
    hasMicrosoft,
    hasEmail: hasGoogle || hasMicrosoft,
    needsOnboarding: !onboardingCompleted,
    email: authUser?.email,
    name: authUser?.name || null,
  });
}
