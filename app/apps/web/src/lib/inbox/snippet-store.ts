/**
 * Personal snippet persistence (INBOX-X05) over the existing user_preferences
 * JSONB k-v (resource "inbox", key "snippets"). Owner-scoped, no migration —
 * same store the image-trust allowlist uses.
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { normalizeSnippets, type Snippet } from "./snippets";

const RESOURCE = "inbox";
const KEY = "snippets";

export async function listSnippets(userId: string): Promise<Snippet[]> {
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
  return normalizeSnippets((row?.value as { snippets?: unknown } | null)?.snippets);
}

/** Replace the user's whole snippet set (the composer sends the full list). */
export async function saveSnippets(userId: string, snippets: Snippet[]): Promise<Snippet[]> {
  const next = normalizeSnippets(snippets);
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: { snippets: next } })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: { snippets: next } },
    });
  return next;
}
