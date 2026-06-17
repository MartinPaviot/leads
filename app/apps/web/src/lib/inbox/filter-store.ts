/**
 * Per-user inbox filter storage (INBOX-T02) in the user_preferences JSONB store
 * (resource "inbox", key "filters") — NO schema migration. Owner-scoped by userId.
 */
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { LabelFilter } from "./filter-match";

const RESOURCE = "inbox";
const KEY = "filters";

export async function getUserFilters(userId: string): Promise<LabelFilter[]> {
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
  return Array.isArray(v) ? (v as LabelFilter[]) : [];
}

export async function saveUserFilters(userId: string, filters: LabelFilter[]): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: filters })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: filters, updatedAt: new Date() },
    });
}
