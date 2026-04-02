import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { companies, contacts, authAccounts } from "@/db/schema";
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

  const accounts = Number(accountCount?.count || 0);
  const contactTotal = Number(contactCount?.count || 0);
  const isNew = accounts === 0 && contactTotal === 0;
  const hasGoogle = !!googleAccount;

  return Response.json({
    isNew,
    accounts,
    contacts: contactTotal,
    hasGoogle,
    needsOnboarding: isNew,
  });
}
