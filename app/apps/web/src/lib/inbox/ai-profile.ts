/**
 * Inbox AI data-handling profile (INBOX-P03 zero-retention / opt-out) — a
 * per-user processing profile stored owner-scoped in user_preferences JSONB
 * (resource "inbox", key "ai_profile"; NO migration) + pure resolvers the AI
 * feature endpoints gate on.
 *
 * "off"            — no inbox AI runs at all (fail-closed; features return their
 *                    empty / non-answer result, never a fabricated one).
 * "zero_retention" — AI runs but requests should carry a no-retention flag (the
 *                    actual provider-header wiring in lib/ai is the runtime-verify
 *                    residual; the profile + gating decision ship here).
 * "standard"       — default.
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type AiProcessingProfile = "standard" | "zero_retention" | "off";

export interface AiProfileOption {
  id: AiProcessingProfile;
  label: string;
  description: string;
}

export const AI_PROFILE_OPTIONS: AiProfileOption[] = [
  { id: "standard", label: "Standard", description: "AI features on; traces kept for quality and audit." },
  { id: "zero_retention", label: "Zero retention", description: "AI features on, but requests are flagged no-retention with the model provider." },
  { id: "off", label: "Off", description: "No AI runs on your inbox — summaries, drafts, and ask are disabled." },
];

const VALID: AiProcessingProfile[] = ["standard", "zero_retention", "off"];

export function normalizeProfile(v: unknown): AiProcessingProfile {
  return typeof v === "string" && (VALID as string[]).includes(v) ? (v as AiProcessingProfile) : "standard";
}

export function aiEnabled(profile: AiProcessingProfile): boolean {
  return profile !== "off";
}

export function isZeroRetention(profile: AiProcessingProfile): boolean {
  return profile === "zero_retention";
}

const RESOURCE = "inbox";
const KEY = "ai_profile";

export async function getAiProfile(userId: string): Promise<AiProcessingProfile> {
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
  const v = row?.value as { profile?: unknown } | undefined;
  return normalizeProfile(v?.profile);
}

export async function saveAiProfile(userId: string, profile: AiProcessingProfile): Promise<AiProcessingProfile> {
  const p = normalizeProfile(profile);
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: { profile: p } })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: { profile: p }, updatedAt: new Date() },
    });
  return p;
}
