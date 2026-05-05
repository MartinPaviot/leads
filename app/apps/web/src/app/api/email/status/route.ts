import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { authAccounts, activities } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if Google account is connected
    const [googleAccount] = await db
      .select()
      .from(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, authCtx.userId),
          eq(authAccounts.provider, "google")
        )
      )
      .limit(1);

    if (!googleAccount) {
      return Response.json({
        connected: false,
        provider: null,
        emailCount: 0,
        lastSync: null,
      });
    }

    // Count email activities
    const [emailCount] = await db
      .select({ value: count() })
      .from(activities)
      .where(and(eq(activities.channel, "email"), eq(activities.tenantId, authCtx.tenantId)));

    return Response.json({
      connected: true,
      provider: "google",
      emailCount: emailCount?.value || 0,
      lastSync: null, // TODO: track actual last sync timestamp
    });
  } catch (error) {
    console.error("Failed to get email status:", error);
    return Response.json({ error: "Failed to get status" }, { status: 500 });
  }
}
