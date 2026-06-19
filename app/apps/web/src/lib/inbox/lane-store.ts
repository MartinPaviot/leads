/**
 * Per-user smart-lane storage (INBOX-T01) in the existing user_preferences JSONB
 * k-v store (resource "inbox", key "lanes") — NO schema migration. Lanes are
 * personal, like the inbox; reads/writes are owner-scoped by userId.
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { LaneDefinition } from "./lane-match";

const RESOURCE = "inbox";
const KEY = "lanes";

export interface InboxLane extends LaneDefinition {
  id: string;
  name: string;
  hideWhenEmpty?: boolean;
}

export async function getUserLanes(userId: string): Promise<InboxLane[]> {
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
  const v = row?.value;
  return Array.isArray(v) ? (v as InboxLane[]) : [];
}

export async function saveUserLanes(userId: string, lanes: InboxLane[]): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: lanes })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: lanes, updatedAt: new Date() },
    });
}
