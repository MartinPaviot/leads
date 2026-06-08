/**
 * Tenant-level CalDAV fetch — the DB-aware layer over `caldav.ts`.
 *
 * Kept separate from `caldav.ts` (which is pure transport + parsing, so it stays
 * unit-testable without a database) because this reads `connected_mailboxes`,
 * decrypts the stored password, and stamps `caldav_last_sync_at`. Used by both
 * the 15-min `cron-calendar-sync` and the manual `/api/calendar/sync` route.
 */

import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { fetchCalDavMeetings } from "@/lib/integrations/caldav";
import type { SyncedMeeting } from "@/lib/integrations/calendar";
import { logger } from "@/lib/observability/logger";

/**
 * Fetch all in-window meetings from every CalDAV-enabled custom mailbox in a
 * tenant. A failing mailbox is skipped (logged), never fatal to the others.
 * Stamps `caldavLastSyncAt` on each mailbox it successfully reads.
 */
export async function fetchCalDavMeetingsForTenant(
  tenantId: string,
  daysBack = 30,
  daysForward = 14,
): Promise<SyncedMeeting[]> {
  const boxes = await db
    .select()
    .from(connectedMailboxes)
    .where(
      and(
        eq(connectedMailboxes.tenantId, tenantId),
        eq(connectedMailboxes.provider, "smtp_custom"),
        isNotNull(connectedMailboxes.caldavUrl),
      ),
    );

  const all: SyncedMeeting[] = [];
  for (const box of boxes) {
    if (!box.secretEncrypted || !box.caldavUrl) continue;
    let password: string;
    try {
      password = decryptSecret(box.secretEncrypted);
    } catch {
      logger.error("caldav-sync: could not decrypt mailbox secret", {
        tenantId,
        mailboxId: box.id,
      });
      continue;
    }
    try {
      const meetings = await fetchCalDavMeetings(
        { email: box.emailAddress, password, calendarUrl: box.caldavUrl },
        daysBack,
        daysForward,
      );
      all.push(...meetings);
      await db
        .update(connectedMailboxes)
        .set({ caldavLastSyncAt: new Date() })
        .where(eq(connectedMailboxes.id, box.id));
    } catch (err) {
      logger.error("caldav-sync: fetch failed for mailbox", {
        tenantId,
        mailboxId: box.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return all;
}

/** Tenant ids (deduped) that have at least one CalDAV-enabled custom mailbox. */
export async function tenantsWithCalDav(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ tenantId: connectedMailboxes.tenantId })
    .from(connectedMailboxes)
    .where(
      and(
        eq(connectedMailboxes.provider, "smtp_custom"),
        isNotNull(connectedMailboxes.caldavUrl),
      ),
    );
  return rows.map((r) => r.tenantId);
}
