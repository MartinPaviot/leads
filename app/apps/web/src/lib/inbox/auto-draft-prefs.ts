/**
 * Inbox auto-draft preference (B1) — a per-user boolean ("pre-draft replies on
 * thread open") stored owner-scoped in user_preferences JSONB (resource "inbox",
 * key "auto_draft"; NO migration), default OFF.
 *
 * Mirror of voice-prefs.ts in shape. Auto-draft NEVER overrides selectivity: the
 * pane only fires generateDraft() on open WHERE the conversation is replyWorthy
 * (R4.4). This pref only governs whether reply-worthy threads pre-draft at all.
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface AutoDraftPrefs {
  enabled: boolean;
}

export const DEFAULT_AUTO_DRAFT: AutoDraftPrefs = { enabled: false };

export function clampAutoDraft(prefs: Partial<AutoDraftPrefs> | null | undefined): AutoDraftPrefs {
  return { enabled: prefs?.enabled === true };
}

const RESOURCE = "inbox";
const KEY = "auto_draft";

export async function getAutoDraft(userId: string): Promise<AutoDraftPrefs> {
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
  const v = row?.value as Partial<AutoDraftPrefs> | undefined;
  if (!v || typeof v !== "object") return DEFAULT_AUTO_DRAFT;
  return clampAutoDraft(v);
}

export async function saveAutoDraft(userId: string, enabled: boolean): Promise<AutoDraftPrefs> {
  const clamped = clampAutoDraft({ enabled });
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: clamped })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: clamped, updatedAt: new Date() },
    });
  return clamped;
}
