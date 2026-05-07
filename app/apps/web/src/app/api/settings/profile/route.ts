import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { users, connectedMailboxes, authAccounts, tenants } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [user] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(eq(users.id, authCtx.appUserId))
      .limit(1);

    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    // Fetch connected mailboxes (these have the real email addresses)
    const mailboxes = await db
      .select({
        emailAddress: connectedMailboxes.emailAddress,
        provider: connectedMailboxes.provider,
        status: connectedMailboxes.status,
      })
      .from(connectedMailboxes)
      .where(eq(connectedMailboxes.tenantId, authCtx.tenantId));

    // Check OAuth providers linked — fetch id_token to extract the real email
    const oauthRows = await db
      .select({
        provider: authAccounts.provider,
        idToken: authAccounts.id_token,
      })
      .from(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, authCtx.userId),
          ne(authAccounts.provider, "credentials"),
        )
      );

    // Build connected accounts list from mailboxes (real emails)
    const result: Array<{ emailAddress: string; provider: string; status: string }> = mailboxes.map((mb) => ({
      emailAddress: mb.emailAddress,
      provider: mb.provider,
      status: mb.status as string,
    }));

    // For OAuth providers not already in connected_mailboxes,
    // decode the id_token JWT to get the real provider email
    const mailboxEmails = new Set(mailboxes.map((mb) => mb.emailAddress));
    for (const oa of oauthRows) {
      const providerLabel = oa.provider === "google" ? "gmail"
        : oa.provider === "microsoft-entra-id" ? "outlook"
        : oa.provider;

      // Decode the id_token payload (base64url-encoded JWT, no signature verification needed)
      let oauthEmail = "";
      if (oa.idToken) {
        try {
          const payload = JSON.parse(
            Buffer.from(oa.idToken.split(".")[1], "base64url").toString()
          );
          oauthEmail = payload.email || payload.preferred_username || "";
        } catch { /* ignore decode errors */ }
      }

      // Only add if this email isn't already listed from connected_mailboxes
      if (oauthEmail && !mailboxEmails.has(oauthEmail)) {
        result.push({
          emailAddress: oauthEmail,
          provider: providerLabel,
          status: "linked",
        });
      } else if (!oauthEmail) {
        // No id_token / couldn't decode — check if provider already covered
        const hasProvider = result.some((r) => r.provider === providerLabel);
        if (!hasProvider) {
          result.push({ emailAddress: "", provider: providerLabel, status: "linked" });
        }
      }
    }

    // Get locale settings from tenant
    const settings = await getTenantSettings(authCtx.tenantId);

    return Response.json({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email,
      language: settings.language || "en",
      timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      connectedMailboxes: result,
    });
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return Response.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.firstName !== undefined) updates.firstName = body.firstName.trim();
    if (body.lastName !== undefined) updates.lastName = body.lastName.trim();

    await db.update(users).set(updates).where(eq(users.id, authCtx.appUserId));

    // Save locale settings to tenant settings
    if (body.language !== undefined || body.timezone !== undefined) {
      const settings = await getTenantSettings(authCtx.tenantId);
      const [tenant] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
      const currentSettings = (tenant?.settings || {}) as Record<string, unknown>;
      const updatedSettings = { ...currentSettings };
      if (body.language !== undefined) updatedSettings.language = body.language;
      if (body.timezone !== undefined) updatedSettings.timezone = body.timezone;
      await db.update(tenants).set({ settings: updatedSettings }).where(eq(tenants.id, authCtx.tenantId));
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update profile:", error);
    return Response.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
