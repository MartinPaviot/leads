import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { authAccounts, connectedMailboxes, tenants } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";

/**
 * Unified Mail & Calendar API — merges OAuth accounts (reading/sync)
 * with connected mailboxes (sending) into a single view.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // 1. Get OAuth-connected accounts (for reading email + calendar)
    const oauthRows = await db
      .select({
        provider: authAccounts.provider,
        idToken: authAccounts.id_token,
        accessToken: authAccounts.access_token,
      })
      .from(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, authCtx.userId),
          ne(authAccounts.provider, "credentials"),
        )
      );

    // 2. Get connected mailboxes (for sending)
    const mailboxRows = await db
      .select()
      .from(connectedMailboxes)
      .where(eq(connectedMailboxes.tenantId, authCtx.tenantId))
      .orderBy(connectedMailboxes.createdAt);

    // 3. Get tenant settings (sync preferences)
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, authCtx.tenantId))
      .limit(1);

    const settings = (tenant?.settings || {}) as Record<string, unknown>;

    // 4. Build unified account list
    type MailboxRow = typeof mailboxRows[number];
    const mailboxByEmail = new Map<string, MailboxRow>(
      mailboxRows.map((mb) => [mb.emailAddress.toLowerCase(), mb])
    );

    const accounts: Array<{
      id: string;
      emailAddress: string;
      provider: string;
      providerLabel: string;
      // Connection status
      oauthConnected: boolean;
      mailboxConnected: boolean;
      status: string;
      // Sync info
      lastEmailSyncAt: string | null;
      lastCalSyncAt: string | null;
      // Sending info
      dailyLimit: number;
      sentToday: number;
      sentTotal: number;
      healthScore: number;
      // Warmup
      warmupStartedAt: string | null;
      warmupDailyTarget: number;
      warmupCompletedAt: string | null;
    }> = [];

    const processedEmails = new Set<string>();

    // Process OAuth accounts first
    for (const oa of oauthRows) {
      const providerLabel = oa.provider === "google" ? "gmail"
        : oa.provider === "microsoft-entra-id" ? "outlook"
        : oa.provider;

      // Decode email from id_token
      let oauthEmail = "";
      if (oa.idToken) {
        try {
          const payload = JSON.parse(
            Buffer.from(oa.idToken.split(".")[1], "base64url").toString()
          );
          oauthEmail = (payload.email || payload.preferred_username || "").toLowerCase();
        } catch { /* ignore decode errors */ }
      }

      if (!oauthEmail) continue;
      processedEmails.add(oauthEmail);

      // Check if there's a matching mailbox for sending
      const mailbox = mailboxByEmail.get(oauthEmail);

      accounts.push({
        id: mailbox?.id || `oauth-${oa.provider}-${oauthEmail}`,
        emailAddress: oauthEmail,
        provider: oa.provider,
        providerLabel,
        oauthConnected: true,
        mailboxConnected: !!mailbox,
        status: mailbox?.status as string || "syncing",
        lastEmailSyncAt: null, // TODO: track in connectedAccounts table in Phase B
        lastCalSyncAt: null,
        dailyLimit: mailbox?.dailyLimit || 0,
        sentToday: mailbox?.sentToday || 0,
        sentTotal: mailbox?.sentTotal || 0,
        healthScore: mailbox?.healthScore || 100,
        warmupStartedAt: mailbox?.warmupStartedAt?.toISOString() || null,
        warmupDailyTarget: mailbox?.warmupDailyTarget || 0,
        warmupCompletedAt: mailbox?.warmupCompletedAt?.toISOString() || null,
      });
    }

    // Add any mailboxes not covered by OAuth (e.g. SMTP-configured)
    for (const mb of mailboxRows) {
      if (processedEmails.has(mb.emailAddress.toLowerCase())) continue;
      accounts.push({
        id: mb.id,
        emailAddress: mb.emailAddress,
        provider: mb.provider,
        providerLabel: mb.provider,
        oauthConnected: false,
        mailboxConnected: true,
        status: mb.status as string,
        lastEmailSyncAt: null,
        lastCalSyncAt: null,
        dailyLimit: mb.dailyLimit || 0,
        sentToday: mb.sentToday || 0,
        sentTotal: mb.sentTotal || 0,
        healthScore: mb.healthScore || 100,
        warmupStartedAt: mb.warmupStartedAt?.toISOString() || null,
        warmupDailyTarget: mb.warmupDailyTarget || 0,
        warmupCompletedAt: mb.warmupCompletedAt?.toISOString() || null,
      });
    }

    return Response.json({
      accounts,
      syncPreferences: {
        contactCreationMode: settings.contactCreationMode || "selective",
        backsyncRange: settings.backsyncRange || "3m",
        doNotTrackDomains: settings.doNotTrackDomains || [],
      },
    });
  } catch (error) {
    console.error("Failed to fetch mail-calendar settings:", error);
    return Response.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}
