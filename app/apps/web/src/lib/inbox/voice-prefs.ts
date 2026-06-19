/**
 * Inbox voice calibration (INBOX-O03) — a per-user writing-voice preference
 * (tone preset + free-form guidance) stored owner-scoped in user_preferences
 * JSONB (resource "inbox", key "voice"; NO migration) + a pure buildVoicePrompt
 * the drafting endpoints prepend.
 *
 * Complements O02 standing instructions: O02 is *what* to remember, O03 is *how*
 * it should sound. Both compose into the same injectable instruction preamble.
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type VoiceTone = "neutral" | "warm" | "direct" | "formal" | "concise";

export interface VoiceOption {
  id: VoiceTone;
  label: string;
  hint: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "neutral", label: "Neutral", hint: "Default — match the thread." },
  { id: "warm", label: "Warm", hint: "Personable but still concise." },
  { id: "direct", label: "Direct", hint: "Lead with the ask, minimal preamble." },
  { id: "formal", label: "Formal", hint: "Precise, full sentences, no slang." },
  { id: "concise", label: "Concise", hint: "As short as possible while complete." },
];

const TONE_GUIDANCE: Record<VoiceTone, string> = {
  neutral: "",
  warm: "Warm and personable, but still concise and professional.",
  direct: "Direct and to the point; lead with the ask and keep preamble minimal.",
  formal: "Formal and precise; full sentences, no contractions or slang.",
  concise: "As short as possible while still complete; cut every filler word.",
};

export interface VoicePrefs {
  tone: VoiceTone;
  customGuidance?: string;
}

export const DEFAULT_VOICE: VoicePrefs = { tone: "neutral" };

const VALID: VoiceTone[] = ["neutral", "warm", "direct", "formal", "concise"];

export function normalizeTone(v: unknown): VoiceTone {
  return typeof v === "string" && (VALID as string[]).includes(v) ? (v as VoiceTone) : "neutral";
}

export function clampVoice(prefs: Partial<VoicePrefs>): VoicePrefs {
  const tone = normalizeTone(prefs.tone);
  const custom = (typeof prefs.customGuidance === "string" ? prefs.customGuidance : "").trim().slice(0, 300);
  return custom ? { tone, customGuidance: custom } : { tone };
}

/** Pure preamble prepended to a drafting prompt. Empty when neutral + no custom. */
export function buildVoicePrompt(prefs: VoicePrefs): string {
  const parts: string[] = [];
  const g = TONE_GUIDANCE[prefs.tone] || "";
  if (g) parts.push(g);
  const custom = (prefs.customGuidance || "").trim();
  if (custom) parts.push(custom);
  if (parts.length === 0) return "";
  return `Write in this voice: ${parts.join(" ")}`;
}

const RESOURCE = "inbox";
const KEY = "voice";

export async function getVoicePrefs(userId: string): Promise<VoicePrefs> {
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
  const v = row?.value as Partial<VoicePrefs> | undefined;
  if (!v || typeof v !== "object") return DEFAULT_VOICE;
  return clampVoice(v);
}

export async function saveVoicePrefs(userId: string, prefs: Partial<VoicePrefs>): Promise<VoicePrefs> {
  const clamped = clampVoice(prefs);
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: clamped })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: clamped, updatedAt: new Date() },
    });
  return clamped;
}
