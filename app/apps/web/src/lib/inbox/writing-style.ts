/**
 * Writing Style & Tone (B2) — the "sounds like you" engine.
 *
 * A per-user, TRANSPARENT, editable writing-style record stored owner-scoped in
 * user_preferences JSONB (resource "inbox", key "writing_style"; NO migration,
 * same store as voice-prefs / ai-memory / ai-profile). It is the lead voice block
 * the B1 draft engine prepends, refined by tone (voice-prefs) and standing facts
 * (ai-memory) on top.
 *
 * Pure helpers (clamp / buildWritingStylePrompt / selectAudience /
 * normalizeSchedulingLink) are unit-tested with no DB. The editable prompt is
 * shown and used verbatim (transparency, Upstream parity), and any auto-send /
 * skip-approval phrasing is scrubbed via isAutoSendInstruction — the
 * never-auto-send contract holds even through a hand-edited prompt (R2.4).
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isAutoSendInstruction } from "@/lib/inbox/ai-memory";

const RESOURCE = "inbox";
const KEY = "writing_style";

export interface AudienceMatch {
  kind: "domain" | "title" | "contact_tag" | "all";
  /** e.g. "acme.com", "investor", "vip"; absent/ignored for "all". */
  value?: string;
}

export interface Audience {
  id: string;
  label: string;
  match: AudienceMatch;
  /** Replaces the base style prompt when this audience matches (R4.3). */
  prompt: string;
}

export interface WritingStyle {
  aboutMe: string;
  role: string;
  schedulingLink: string;
  signOff: string;
  prompt: string;
  audiences: Audience[];
  /** ISO when the prompt was last accepted from a derive proposal (R5.4). */
  derivedAt?: string;
}

/**
 * The verbatim Upstream default writing-style prompt
 * (_research/upstream/teardown/09-settings-writing-style-and-tone.md:34-38), so
 * no user faces a blank textarea (R1.2). Hyphen bullets rather than "•" to keep
 * the no-emoji / plain-glyph house rule; the 5 directives are verbatim.
 */
export const DEFAULT_PROMPT = `- Default tone: clear, direct, friendly, low-ego, no hype.
- Keep it short. Prefer 3-6 short lines over long paragraphs.
- Use simple wording. Avoid corporate buzzwords.
- If a message can be one sentence, make it one sentence.
- Avoid overly "salesy" language and sounding like a template.`;

export const DEFAULT_WRITING_STYLE: WritingStyle = {
  aboutMe: "",
  role: "",
  schedulingLink: "",
  signOff: "",
  prompt: DEFAULT_PROMPT,
  audiences: [],
};

const MAX = {
  prompt: 2000,
  aboutMe: 600,
  short: 120,
  audiences: 8,
  audienceLabel: 60,
} as const;

const MATCH_KINDS: ReadonlySet<string> = new Set(["domain", "title", "contact_tag", "all"]);

/**
 * Validate a scheduling link to an http(s) URL or bare domain; return it
 * normalized (https-scheme, no trailing slash) or "" if it is neither (R1.4 —
 * never persist a malformed link).
 */
export function normalizeSchedulingLink(raw: unknown): string {
  const s = (typeof raw === "string" ? raw : "").trim();
  if (!s) return "";
  const candidate = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(candidate);
    // Require a dotted, space-free host so "not a link" / "foo" are rejected.
    if (!u.hostname.includes(".") || /\s/.test(u.hostname)) return "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function clampMatch(m: unknown): AudienceMatch | null {
  if (!m || typeof m !== "object") return null;
  const o = m as Partial<AudienceMatch>;
  const kind = typeof o.kind === "string" && MATCH_KINDS.has(o.kind) ? (o.kind as AudienceMatch["kind"]) : null;
  if (!kind) return null;
  if (kind === "all") return { kind: "all" };
  const value = str(o.value).trim().slice(0, MAX.short);
  if (!value) return null; // a non-"all" rule needs a value to match on
  return { kind, value };
}

function clampAudience(a: unknown): Audience | null {
  if (!a || typeof a !== "object") return null;
  const o = a as Partial<Audience>;
  const label = str(o.label).trim().slice(0, MAX.audienceLabel);
  const prompt = str(o.prompt).trim().slice(0, MAX.prompt);
  if (!label || !prompt) return null; // an audience needs a label + a prompt to mean anything
  const match = clampMatch(o.match);
  if (!match) return null;
  const id = str(o.id).trim() || crypto.randomUUID();
  return { id, label, match, prompt };
}

/** Enforce caps, validate, drop blanks at save time (pure, R1.3). */
export function clampWritingStyle(input: Partial<WritingStyle> | null | undefined): WritingStyle {
  const promptRaw = str(input?.prompt).trim();
  const prompt = (promptRaw || DEFAULT_PROMPT).slice(0, MAX.prompt);
  const aboutMe = str(input?.aboutMe).trim().slice(0, MAX.aboutMe);
  const role = str(input?.role).trim().slice(0, MAX.short);
  const signOff = str(input?.signOff).trim().slice(0, MAX.short);
  const schedulingLink = normalizeSchedulingLink(input?.schedulingLink).slice(0, MAX.short);
  const audiences = (Array.isArray(input?.audiences) ? input!.audiences : [])
    .map(clampAudience)
    .filter((a): a is Audience => a !== null)
    .slice(0, MAX.audiences);
  const base: WritingStyle = { aboutMe, role, schedulingLink, signOff, prompt, audiences };
  const derivedAt = typeof input?.derivedAt === "string" ? input.derivedAt : undefined;
  return derivedAt ? { ...base, derivedAt } : base;
}

/** Drop any line that reads as an auto-send / skip-approval directive (R2.4). */
function scrubAutoSend(text: string, ignored: string[]): string {
  const kept: string[] = [];
  for (const line of (text || "").split("\n")) {
    if (line.trim() && isAutoSendInstruction(line)) {
      ignored.push(line.trim());
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

/** A recipient/contact segment for audience routing (R4.2). All fields optional. */
export interface RecipientSegment {
  email?: string | null;
  domain?: string | null;
  title?: string | null;
  tags?: string[];
}

function domainOf(email?: string | null): string {
  const parts = (email || "").split("@");
  return parts.length === 2 ? parts[1] : "";
}

/**
 * Resolve the FIRST audience whose match rule fits the recipient (R4.2/R4.4):
 * pure, order-stable, deterministic. Returns null when none match (→ base prompt).
 */
export function selectAudience(style: WritingStyle, recipient: RecipientSegment): Audience | null {
  const audiences = style?.audiences ?? [];
  const domain = (recipient.domain || domainOf(recipient.email)).toLowerCase();
  const title = (recipient.title || "").toLowerCase();
  const tags = (recipient.tags || []).map((t) => str(t).toLowerCase());
  for (const a of audiences) {
    const m = a.match;
    if (!m) continue;
    if (m.kind === "all") return a;
    const val = str(m.value).toLowerCase().trim();
    if (!val) continue;
    if (m.kind === "domain" && domain && domain === val) return a;
    if (m.kind === "title" && title && title.includes(val)) return a;
    if (m.kind === "contact_tag" && tags.includes(val)) return a;
  }
  return null;
}

/**
 * The instruction preamble the draft engine prepends (R3.1). Pure.
 * Order: (1) base OR matched-audience prompt [replace, not append, R4.3],
 * (2) role + about-me, (3) sign-off, (4) scheduling-link (only when proposing a
 * meeting, R3.3). Auto-send phrasing is scrubbed and reported via `ignored`.
 */
export function buildWritingStylePrompt(
  style: WritingStyle,
  audienceId?: string,
): { prompt: string; ignored: string[] } {
  const s = style || DEFAULT_WRITING_STYLE;
  const ignored: string[] = [];

  const matched = audienceId ? s.audiences.find((a) => a.id === audienceId) : undefined;
  const basePrompt = scrubAutoSend(matched?.prompt || s.prompt || DEFAULT_PROMPT, ignored).trim();

  const blocks: string[] = [];
  if (basePrompt) blocks.push(`Write in this style:\n${basePrompt}`);

  const ident: string[] = [];
  if (s.role.trim()) ident.push(`The user is ${s.role.trim()}.`);
  const about = scrubAutoSend(s.aboutMe, ignored).trim();
  if (about) ident.push(`About the user: ${about}`);
  if (ident.length) blocks.push(ident.join(" "));

  if (s.signOff.trim()) blocks.push(`Sign off with "${s.signOff.trim()}".`);

  if (s.schedulingLink.trim()) {
    blocks.push(
      `When the reply proposes a meeting or call, offer this booking link: ${s.schedulingLink.trim()}. Never invent or guess a link.`,
    );
  }

  return { prompt: blocks.join("\n\n"), ignored };
}

export async function getWritingStyle(userId: string): Promise<WritingStyle> {
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
  const v = row?.value as Partial<WritingStyle> | undefined;
  if (!v || typeof v !== "object") return DEFAULT_WRITING_STYLE;
  return clampWritingStyle(v);
}

export async function saveWritingStyle(userId: string, style: Partial<WritingStyle>): Promise<WritingStyle> {
  const clamped = clampWritingStyle(style);
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: clamped })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: clamped, updatedAt: new Date() },
    });
  return clamped;
}

/* ------------------------------------------------------------------ */
/*  Derive proposal ("Fill it up for me!") — a transient, reviewable   */
/*  record that NEVER overwrites the live prompt until accepted (R5.4).*/
/* ------------------------------------------------------------------ */

const PROPOSAL_KEY = "writing_style_proposal";

export type StyleProposalStatus = "idle" | "pending" | "ready" | "rejected" | "insufficient";

export interface StyleProposal {
  status: StyleProposalStatus;
  prompt?: string;
  aboutMe?: string;
  signOff?: string;
  /** Why it is not "ready" (rejected reason / insufficient corpus). */
  reason?: string;
  /** ISO timestamp the proposal was written. */
  at?: string;
}

export const IDLE_PROPOSAL: StyleProposal = { status: "idle" };

export async function getStyleProposal(userId: string): Promise<StyleProposal> {
  const [row] = await db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.resource, RESOURCE),
        eq(userPreferences.key, PROPOSAL_KEY),
      ),
    )
    .limit(1);
  const v = row?.value as Partial<StyleProposal> | undefined;
  if (!v || typeof v !== "object" || typeof v.status !== "string") return IDLE_PROPOSAL;
  return v as StyleProposal;
}

export async function saveStyleProposal(userId: string, proposal: StyleProposal): Promise<StyleProposal> {
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: PROPOSAL_KEY, value: proposal })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: proposal, updatedAt: new Date() },
    });
  return proposal;
}

export async function clearStyleProposal(userId: string): Promise<void> {
  await db
    .delete(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.resource, RESOURCE),
        eq(userPreferences.key, PROPOSAL_KEY),
      ),
    );
}
