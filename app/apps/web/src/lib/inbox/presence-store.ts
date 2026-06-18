/**
 * DB heartbeat + read for thread presence (INBOX-X03) over the inbox_presence
 * table. Every call is DEFENSIVE: if the table hasn't been migrated in yet the
 * query throws and we no-op / return empty, so the inbox runs identically.
 */

import { db } from "@/db";
import { inboxPresence } from "@/db/schema";
import { and, eq, gte, ne } from "drizzle-orm";
import { PRESENCE_ACTIVE_MS, type Viewer } from "./presence";

/** Record/refresh the viewer's presence on a thread. */
export async function heartbeat(
  tenantId: string,
  conversationKey: string,
  userId: string,
  state: string,
): Promise<void> {
  try {
    const now = new Date();
    await db
      .insert(inboxPresence)
      .values({ tenantId, conversationKey, userId, state, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [inboxPresence.tenantId, inboxPresence.conversationKey, inboxPresence.userId],
        set: { state, lastSeenAt: now },
      });
  } catch {
    /* table not migrated → presence simply doesn't record */
  }
}

/** Other members active on the thread within the presence window. */
export async function getViewers(
  tenantId: string,
  conversationKey: string,
  excludeUserId: string,
): Promise<Viewer[]> {
  try {
    const since = new Date(Date.now() - PRESENCE_ACTIVE_MS);
    return await db
      .select({ userId: inboxPresence.userId, state: inboxPresence.state })
      .from(inboxPresence)
      .where(
        and(
          eq(inboxPresence.tenantId, tenantId),
          eq(inboxPresence.conversationKey, conversationKey),
          gte(inboxPresence.lastSeenAt, since),
          ne(inboxPresence.userId, excludeUserId),
        ),
      );
  } catch {
    return [];
  }
}
