/**
 * Per-feature autonomy hub (INBOX-T11 / O06) — one place to set how much each
 * AI-native inbox feature may act: "off" | "suggest" | "auto". Persisted
 * owner-scoped in user_preferences JSONB (resource "inbox", key "autonomy"; NO
 * migration). Pure resolver + a feature catalog; the settings page reads/writes
 * this and feature code consults resolveFeatureAutonomy before acting.
 *
 * Hard guarantee (mirrors lib/inbox/autonomy.ts): nothing here can make the inbox
 * SEND or write to a prospect/CRM on its own — those features carry a "suggest"
 * ceiling, so the dial can never push them to "auto".
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type FeatureAutonomy = "off" | "suggest" | "auto";

export interface AutonomyFeature {
  id: string;
  label: string;
  description: string;
  /** Highest autonomy this feature may reach. "suggest" = approval-gated forever. */
  ceiling: FeatureAutonomy;
  default: FeatureAutonomy;
}

// The tunable surface. ceiling "suggest" enforces the never-auto-act contract for
// anything that writes outward (drafting, sending); read-only/internal features
// may reach "auto".
export const AUTONOMY_CATALOG: AutonomyFeature[] = [
  { id: "summarize", label: "Thread & inbox summaries", description: "TL;DRs, catch-me-up, key points.", ceiling: "auto", default: "auto" },
  { id: "classify", label: "Triage & prioritization", description: "Importance, intent, lanes, SLA.", ceiling: "auto", default: "auto" },
  { id: "capture", label: "Capture to CRM", description: "Log contacts, meetings, and notes.", ceiling: "auto", default: "suggest" },
  { id: "nudge", label: "Follow-up nudges", description: "Resurface threads waiting on a reply.", ceiling: "auto", default: "suggest" },
  { id: "voice_of_customer", label: "Voice of customer", description: "Roll up requests and objections.", ceiling: "auto", default: "suggest" },
  { id: "draft", label: "Reply drafting", description: "Suggested replies and drafts from bullets.", ceiling: "suggest", default: "suggest" },
  { id: "send", label: "Sending email", description: "Always your explicit decision.", ceiling: "suggest", default: "suggest" },
];

export type AutonomySettings = Record<string, FeatureAutonomy>;

const RESOURCE = "inbox";
const KEY = "autonomy";
const LEVELS: FeatureAutonomy[] = ["off", "suggest", "auto"];

function rank(a: FeatureAutonomy): number {
  return LEVELS.indexOf(a);
}

/** Levels the UI may offer for a feature (capped at its ceiling). */
export function availableLevels(feature: AutonomyFeature): FeatureAutonomy[] {
  return LEVELS.filter((l) => rank(l) <= rank(feature.ceiling));
}

/** The effective autonomy for a feature: the user's choice, defaulted + clamped to the ceiling. */
export function resolveFeatureAutonomy(settings: AutonomySettings, featureId: string): FeatureAutonomy {
  const feature = AUTONOMY_CATALOG.find((f) => f.id === featureId);
  if (!feature) return "off";
  const chosen = settings?.[featureId];
  const level: FeatureAutonomy = chosen && LEVELS.includes(chosen) ? chosen : feature.default;
  return rank(level) > rank(feature.ceiling) ? feature.ceiling : level;
}

/** Keep only known features + valid levels, clamped to ceilings (pure; for save). */
export function clampSettings(settings: AutonomySettings): AutonomySettings {
  const out: AutonomySettings = {};
  for (const f of AUTONOMY_CATALOG) {
    const chosen = settings?.[f.id];
    if (chosen && LEVELS.includes(chosen)) {
      out[f.id] = rank(chosen) > rank(f.ceiling) ? f.ceiling : chosen;
    }
  }
  return out;
}

export async function getAutonomySettings(userId: string): Promise<AutonomySettings> {
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
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AutonomySettings) : {};
}

export async function saveAutonomySettings(userId: string, settings: AutonomySettings): Promise<AutonomySettings> {
  const clamped = clampSettings(settings);
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: clamped })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: clamped, updatedAt: new Date() },
    });
  return clamped;
}
