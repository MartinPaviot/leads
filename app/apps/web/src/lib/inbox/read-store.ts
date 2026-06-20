/**
 * Per-thread read state (Upstream parity: unread dot + bold sender + unread counts).
 * Owner-scoped in user_preferences JSONB (resource "inbox", key "readAt") — a
 * structural sibling of starred-store.ts, NO migration (prod-safe from an unmerged
 * branch). Stored as { conversationKey: readAtISO }. A thread is UNREAD when it was
 * never opened OR a newer message has arrived since it was last read — so a fresh
 * reply correctly re-marks a read thread unread (the whole point of an inbox).
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const RESOURCE = "inbox";
const KEY = "readAt";

/** Cap so the read map can't grow unbounded; least-recently-read evicted first. */
export const MAX_READ = 5000;

export async function getReadMap(userId: string): Promise<Record<string, string>> {
  const [row] = await db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.resource, RESOURCE), eq(userPreferences.key, KEY)))
    .limit(1);
  const v = row?.value;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out: Record<string, string> = {};
    for (const [k, t] of Object.entries(v as Record<string, unknown>)) {
      if (typeof t === "string") out[k] = t;
    }
    return out;
  }
  return {};
}

async function saveReadMap(userId: string, map: Record<string, string>): Promise<void> {
  let entries = Object.entries(map);
  if (entries.length > MAX_READ) {
    // Keep the most-recently-read MAX_READ (descending readAt).
    entries = entries.sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, MAX_READ);
  }
  const capped = Object.fromEntries(entries);
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: capped })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: capped, updatedAt: new Date() },
    });
}

/** Mark a conversation read up to `atISO` (defaults to now). Idempotent-ish: only
 * advances the marker forward, never backward. */
export async function markRead(userId: string, conversationKey: string, atISO?: string): Promise<void> {
  const key = conversationKey.trim();
  if (!key) return;
  const at = atISO || new Date().toISOString();
  const map = await getReadMap(userId);
  // Never move the marker backward (a stale client timestamp can't un-read newer mail).
  if (map[key] && map[key] >= at) return;
  map[key] = at;
  await saveReadMap(userId, map);
}

/** PURE: is a conversation unread? Unread when never read, or a newer message
 * arrived after it was last read. */
export function isUnread(readAt: string | undefined, lastAt: string | null | undefined): boolean {
  if (!readAt) return true;
  if (!lastAt) return false;
  return new Date(lastAt).getTime() > new Date(readAt).getTime();
}
