/**
 * Per-user "always show images from this sender" store (INBOX-R02), in the
 * existing user_preferences JSONB k-v (resource "inbox", key
 * "trustedImageSenders") — NO schema migration. Server-only (imports db); the
 * pure matcher lives in image-trust.ts so the client can use it.
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { extractSenderEmail } from "./image-trust";

const RESOURCE = "inbox";
const KEY = "trustedImageSenders";

export async function getTrustedImageSenders(userId: string): Promise<string[]> {
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
  const v = row?.value as { senders?: string[] } | null | undefined;
  return Array.isArray(v?.senders) ? v!.senders : [];
}

/** Add a sender (normalized to its email) to the trusted set. Idempotent + bounded. */
export async function addTrustedImageSender(userId: string, rawSender: string): Promise<string[]> {
  const email = extractSenderEmail(rawSender);
  if (!email) return getTrustedImageSenders(userId);
  const current = await getTrustedImageSenders(userId);
  if (current.includes(email)) return current;
  const next = [...current, email].slice(-500); // bound so the row can't grow unbounded
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: { senders: next } })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: { senders: next }, updatedAt: new Date() },
    });
  return next;
}
