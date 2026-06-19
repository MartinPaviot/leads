import { getAuthContext } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { db } from "@/db";
import { authAccounts, connectedMailboxes, tenants } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { updateTenantSettings } from "@/lib/config/tenant-settings";
import { isNeedsReauth } from "@/lib/integrations/sync-health";
import { decryptOAuthToken } from "@/lib/crypto/oauth-token-crypto";

const CONTACT_CREATION_MODES = ["disabled", "selective", "always"] as const;
const BACKSYNC_RANGES = ["1m", "3m", "6m", "12m"] as const;
type ContactCreationMode = (typeof CONTACT_CREATION_MODES)[number];
type BacksyncRange = (typeof BACKSYNC_RANGES)[number];

function sanitizeDomains(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const cleaned = raw.trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= 200) break;
  }
  return out;
}

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

    // 2. Get connected mailboxes (for sending) — personal: only the ones
    // this user owns, same as the OAuth accounts above.
    const mailboxRows = await db
      .select()
      .from(connectedMailboxes)
      .where(
        and(
          eq(connectedMailboxes.tenantId, authCtx.tenantId),
          eq(connectedMailboxes.userId, authCtx.userId),
        )
      )
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
      calendarConnected: boolean;
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
      const idToken = decryptOAuthToken(oa.idToken);
      if (idToken) {
        try {
          const payload = JSON.parse(
            Buffer.from(idToken.split(".")[1], "base64url").toString()
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
        // OAuth (Google/Microsoft) is granted with calendar.readonly /
        // Calendars.Read in the same consent, so calendar is always connected.
        calendarConnected: true,
        status: isNeedsReauth(settings, authCtx.userId, oa.provider)
          ? "needs_reauth"
          : (mailbox?.status as string || "syncing"),
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
        // Custom IMAP/SMTP mailboxes get calendar via CalDAV when a collection
        // was discovered/configured on connect.
        calendarConnected: !!mb.caldavUrl,
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

/**
 * Update sync preferences (contactCreationMode, backsyncRange, doNotTrackDomains).
 * Available to any authenticated workspace member — these settings affect the
 * whole workspace's sync behavior, not user-private data.
 */
export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // CLE-12 — unified matrix gate on the fresh DB role. Mail/calendar workspace
  // config is admin-only (settings:write); previously this PUT had NO role
  // gate, so any member could change it (gap closed, access NARROWED).
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contactCreationMode = body.contactCreationMode;
  if (
    typeof contactCreationMode !== "string" ||
    !CONTACT_CREATION_MODES.includes(contactCreationMode as ContactCreationMode)
  ) {
    return Response.json(
      { error: `contactCreationMode must be one of ${CONTACT_CREATION_MODES.join(", ")}` },
      { status: 400 },
    );
  }

  const backsyncRange = body.backsyncRange;
  if (
    typeof backsyncRange !== "string" ||
    !BACKSYNC_RANGES.includes(backsyncRange as BacksyncRange)
  ) {
    return Response.json(
      { error: `backsyncRange must be one of ${BACKSYNC_RANGES.join(", ")}` },
      { status: 400 },
    );
  }

  const doNotTrackDomains = sanitizeDomains(body.doNotTrackDomains);

  try {
    await updateTenantSettings(authCtx.tenantId, {
      contactCreationMode: contactCreationMode as ContactCreationMode,
      backsyncRange: backsyncRange as BacksyncRange,
      doNotTrackDomains,
    });

    return Response.json({
      success: true,
      syncPreferences: {
        contactCreationMode,
        backsyncRange,
        doNotTrackDomains,
      },
    });
  } catch (error) {
    console.error("Failed to update mail-calendar sync preferences:", error);
    return Response.json({ error: "Failed to update sync preferences" }, { status: 500 });
  }
}
