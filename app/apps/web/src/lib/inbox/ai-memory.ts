/**
 * Inbox AI memory / standing instructions (INBOX-O02) — pure helpers + a
 * user_preferences JSONB store (resource "inbox", key "memory"; NO migration,
 * owner-scoped like lanes/filters). Standing instructions + "about me" facts get
 * injected into the inbox writing prompts (draft / ask) so the assistant signs,
 * phrases, and caps the way the user told it to — once, persistently.
 *
 * Safe-by-construction: buildMemoryPrompt is pure (unit-tested without a DB);
 * caps are enforced at save; and any instruction that asks to auto-send / skip
 * approval is REFUSED (never-auto-send contract, mirrors lib/inbox/autonomy.ts)
 * — surfaced as `ignored` rather than silently honored.
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const RESOURCE = "inbox";
const KEY = "memory";

export interface StandingInstruction {
  id: string;
  text: string;
}

export interface AboutMe {
  signOffName?: string;
  companyLine?: string;
  keyColleagues?: string[];
  defaultCc?: string[];
}

export interface InboxMemory {
  standingInstructions: StandingInstruction[];
  aboutMe: AboutMe;
}

export const EMPTY_MEMORY: InboxMemory = { standingInstructions: [], aboutMe: {} };

// Caps so a runaway memory can't blow the prompt budget.
export const MAX_INSTRUCTIONS = 12;
export const MAX_INSTRUCTION_LEN = 500;

// Phrases that would turn memory into an auto-send / skip-approval directive.
// These are never injected as honored instructions — drafts stay approval-gated.
const AUTO_SEND_RE =
  /\b(auto[-\s]?send|send (it )?automatically|don'?t ask|never ask|without (my )?(approval|confirmation)|skip (the )?(review|approval))\b/i;

export function isAutoSendInstruction(text: string): boolean {
  return AUTO_SEND_RE.test(text || "");
}

/** Enforce caps + drop blanks at save time (pure). */
export function clampMemory(memory: InboxMemory): InboxMemory {
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const rawInstructions = Array.isArray(memory?.standingInstructions) ? memory.standingInstructions : [];
  const standingInstructions = rawInstructions
    .map((s) => ({
      id: String(s?.id || "").trim(),
      text: str(s?.text).trim().slice(0, MAX_INSTRUCTION_LEN),
    }))
    .filter((s) => s.text.length > 0)
    .slice(0, MAX_INSTRUCTIONS);
  const a = (memory?.aboutMe && typeof memory.aboutMe === "object" ? memory.aboutMe : {}) as AboutMe;
  const aboutMe: AboutMe = {
    signOffName: str(a.signOffName).trim().slice(0, 80) || undefined,
    companyLine: str(a.companyLine).trim().slice(0, 200) || undefined,
    keyColleagues: (Array.isArray(a.keyColleagues) ? a.keyColleagues : []).map((c) => str(c).trim()).filter(Boolean).slice(0, 20),
    defaultCc: (Array.isArray(a.defaultCc) ? a.defaultCc : []).map((c) => str(c).trim()).filter(Boolean).slice(0, 20),
  };
  return { standingInstructions, aboutMe };
}

/**
 * Compose the grounded instruction block to prepend to an inbox writing prompt.
 * Pure. Returns { prompt, ignored }: auto-send-style instructions are excluded
 * from `prompt` and listed in `ignored` (never honored). Empty when nothing set.
 */
export function buildMemoryPrompt(memory: InboxMemory): { prompt: string; ignored: string[] } {
  const m = memory || EMPTY_MEMORY;
  const ignored: string[] = [];
  const honored = (m.standingInstructions || []).filter((s) => {
    if (isAutoSendInstruction(s.text)) {
      ignored.push(s.text);
      return false;
    }
    return true;
  });
  const lines: string[] = [];
  const a = m.aboutMe || {};
  if (a.signOffName) lines.push(`- Sign off as: ${a.signOffName}`);
  if (a.companyLine) lines.push(`- The user's company: ${a.companyLine}`);
  if (a.keyColleagues?.length) lines.push(`- Key colleagues: ${a.keyColleagues.join(", ")}`);
  for (const s of honored) lines.push(`- ${s.text}`);
  if (lines.length === 0) return { prompt: "", ignored };
  return {
    prompt: `The user's standing instructions (follow them unless the thread clearly overrides; never auto-send — drafts are always approval-gated):\n${lines.join("\n")}`,
    ignored,
  };
}

export async function getInboxMemory(userId: string): Promise<InboxMemory> {
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
  const v = row?.value as Partial<InboxMemory> | undefined;
  if (!v || typeof v !== "object") return EMPTY_MEMORY;
  return {
    standingInstructions: Array.isArray(v.standingInstructions) ? v.standingInstructions : [],
    aboutMe: v.aboutMe && typeof v.aboutMe === "object" ? v.aboutMe : {},
  };
}

export async function saveInboxMemory(userId: string, memory: InboxMemory): Promise<InboxMemory> {
  const clamped = clampMemory(memory);
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: clamped })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: clamped, updatedAt: new Date() },
    });
  return clamped;
}
