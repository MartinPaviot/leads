/**
 * Starred conversations (shell-redesign, Upstream `is:starred`). The user's
 * starred thread keys, owner-scoped in user_preferences JSONB (resource "inbox",
 * key "starred") — a structural sibling of noise-override-store.ts, NO migration
 * (prod-safe from an unmerged branch). The Starred sidebar folder filters
 * conversations whose key is in this set; the row/thread ★ toggle writes it.
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const RESOURCE = "inbox";
const KEY = "starred";

/** Cap so a runaway star list can't grow unbounded; oldest entries evicted first. */
export const MAX_STARRED = 2000;

export async function getStarredKeys(userId: string): Promise<string[]> {
  const [row] = await db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.resource, RESOURCE), eq(userPreferences.key, KEY)))
    .limit(1);
  const v = row?.value;
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : [];
}

async function saveStarredKeys(userId: string, keys: string[]): Promise<void> {
  const capped = keys.slice(-MAX_STARRED);
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: capped })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: capped, updatedAt: new Date() },
    });
}

/**
 * Toggle a conversation's star. Returns the new starred state. Pure dedup +
 * toggle on the persisted set; idempotent for a given desired state.
 */
export async function toggleStarred(userId: string, conversationKey: string, starred?: boolean): Promise<boolean> {
  const key = conversationKey.trim();
  if (!key) return false;
  const current = await getStarredKeys(userId);
  const has = current.includes(key);
  const next = starred === undefined ? !has : starred;
  if (next === has) return has; // no change
  const updated = next ? [...current.filter((k) => k !== key), key] : current.filter((k) => k !== key);
  await saveStarredKeys(userId, updated);
  return next;
}
