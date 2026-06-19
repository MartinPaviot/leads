/**
 * Per-user "last seen" marker for the catch-me-up digest (INBOX-S03), stored in
 * the existing user_preferences JSONB k-v store (resource "inbox", key
 * "lastSeenAt") — NO schema migration. Personal + owner-scoped by userId.
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const RESOURCE = "inbox";
const KEY = "lastSeenAt";

export async function getLastSeen(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.resource, RESOURCE),
        eq(userPreferences.key, KEY),
      ),
    )
    .limit(1);
  const v = row?.value as { at?: string } | null | undefined;
  return v?.at ?? null;
}

export async function setLastSeen(userId: string, at: string): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: { at } })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: { at }, updatedAt: new Date() },
    });
}
