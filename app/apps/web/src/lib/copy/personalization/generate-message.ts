/**
 * Spec 19 — grounded personalization. The anti-"generic AI spam" guarantee:
 * every personalized claim traces to a retrieved, cited fact, and when no
 * sufficient-confidence evidence exists the message falls back to segment-level
 * personalization and is flagged low — a personal detail is NEVER invented.
 *
 * Assembly (positioning + offer + personalization layer + CTA, from spec-18
 * assets) is deterministic; the personalization layer is agentic (spec-04
 * runAgent) over injected evidence (spec-08 + a fresh light lookup). A
 * deterministic post-check enforces the cite-or-fallback + brand rules (no
 * em-dashes; FR vouvoiement) — a failed eval is a non-result, never a shipped
 * hallucination.
 *
 * Everything is injected structurally (assets/voice/evidence/role/agent/formats)
 * so this builds off main decoupled and unit-tests with a stub agent (no live
 * model in CI). Blast radius: copy/personalization/* only.
 */

export type Lang = "en" | "fr";
export type PersonalizationLevel = "high" | "low";

export interface Citation {
  id: string;
  /** The fact the personalization may reference. */
  fact: string;
  source: string;
  /** 0..1 — only sufficiently confident evidence is groundable. */
  confidence: number;
  url?: string;
}

export interface Message {
  body: string;
  subject?: string;
  /** The cited evidence actually used (empty on a segment-level fallback). */
  evidence: Citation[];
  personalization_level: PersonalizationLevel;
  roleClass?: string;
  lang: Lang;
  /** Diagnostics: "low-personalization", "eval-failed-fallback", "no-evidence", ... */
  flags: string[];
}

export interface CopyAssets {
  positioning?: string;
  offer?: string;
  cta?: string;
}

export interface VoiceRules {
  /** Banned tokens (spec-18 bannedSet, includes em-dashes). */
  banned: string[];
  frFormality: "vouvoiement" | "tutoiement";
  favoredPhrasings?: string[];
}

export interface PersonalizationAgentInput {
  kind: "grounded-personalization";
  assets: CopyAssets;
  voice: VoiceRules;
  evidence: Citation[];
  roleClass?: string;
  lang: Lang;
  winningFormats?: string[];
}

export interface PersonalizationAgentResult {
  /** spec-04 eval gate. */
  evalPassed: boolean;
  value?: { line: string; subject?: string; citedIds: string[] };
  reason?: string;
}

export interface GenerateMessageDeps {
  assets: CopyAssets;
  voice: VoiceRules;
  /** spec-08 enrichment evidence + a fresh light lookup. */
  evidence: Citation[];
  /** spec-16 buying role; adapts angle. */
  roleClass?: string;
  lang: Lang;
  /** spec-04 governed agent. Absent → straight to segment fallback. */
  runAgent?: (input: PersonalizationAgentInput) => Promise<PersonalizationAgentResult>;
  /** spec-29 performance store (read-only): historically converting formats. */
  winningFormats?: string[];
  /** AC2 fallback line — segment-tailored, contains NO personal detail. */
  segmentLine?: string;
  /** Evidence confidence floor for grounding (default 0.6). */
  minConfidence?: number;
}

const DEFAULT_MIN_CONFIDENCE = 0.6;
/** Always banned regardless of the injected voice (AC5: no em-dashes). */
const ALWAYS_BANNED = ["—", "–", "--"];
/** Informal FR pronouns — a vouvoiement violation (AC3). */
const FR_INFORMAL = /\b(tu|ton|ta|tes|toi|t'es)\b/i;

/** Assemble the body deterministically: positioning + offer + personalization + CTA, blank-line joined. */
export function assembleBody(assets: CopyAssets, personalizationLine: string): string {
  return [assets.positioning, assets.offer, personalizationLine, assets.cta]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/** Banned tokens / em-dashes present in `text` (case-insensitive). Empty = clean. */
export function brandViolations(text: string, banned: string[]): string[] {
  const lower = text.toLowerCase();
  return [...new Set([...banned, ...ALWAYS_BANNED])].filter((b) => b && lower.includes(b.toLowerCase()));
}

/**
 * AC5 post-check on an agent personalization. Returns the reasons it is NOT
 * usable; an empty array means the grounded line may ship. Deterministic, so a
 * stub model exercises every branch in CI.
 */
export function personalizationViolations(
  value: { line: string; citedIds: string[] },
  usableEvidence: Citation[],
  deps: Pick<GenerateMessageDeps, "voice" | "lang">,
): string[] {
  const reasons: string[] = [];
  const usableIds = new Set(usableEvidence.map((c) => c.id));
  if (!value.line.trim()) reasons.push("empty-line");
  if (value.citedIds.length === 0) reasons.push("no-citation"); // a personalized claim must cite
  if (value.citedIds.some((id) => !usableIds.has(id))) reasons.push("uncited-evidence"); // cited a fact we don't have
  const brand = brandViolations(value.line, deps.voice.banned);
  if (brand.length > 0) reasons.push(`brand:${brand.join("|")}`);
  if (deps.lang === "fr" && deps.voice.frFormality === "vouvoiement" && FR_INFORMAL.test(value.line)) {
    reasons.push("fr-informal");
  }
  return reasons;
}

/**
 * Generate one grounded message. Returns a high-personalization message only
 * when a grounded, eval-passing line exists; otherwise a flagged segment-level
 * fallback. Never invents a personal detail.
 */
export async function generateMessage(deps: GenerateMessageDeps): Promise<Message> {
  const minConf = deps.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const usable = deps.evidence.filter((c) => Number.isFinite(c.confidence) && c.confidence >= minConf);

  const fallback = (flags: string[]): Message => ({
    body: assembleBody(deps.assets, (deps.segmentLine ?? "").trim()),
    evidence: [],
    personalization_level: "low",
    roleClass: deps.roleClass,
    lang: deps.lang,
    flags: ["low-personalization", ...flags],
  });

  // AC2 — no groundable evidence (or no agent) → segment fallback, never invent.
  if (usable.length === 0) return fallback(["no-evidence"]);
  if (!deps.runAgent) return fallback(["no-agent"]);

  let result: PersonalizationAgentResult;
  try {
    result = await deps.runAgent({
      kind: "grounded-personalization",
      assets: deps.assets,
      voice: deps.voice,
      evidence: usable,
      roleClass: deps.roleClass,
      lang: deps.lang,
      winningFormats: deps.winningFormats,
    });
  } catch {
    return fallback(["agent-error"]);
  }

  // AC5 — a failed eval is a non-result; fall back rather than ship ungrounded.
  if (!result.evalPassed || !result.value) return fallback(["eval-failed-fallback"]);

  const reasons = personalizationViolations(result.value, usable, deps);
  if (reasons.length > 0) return fallback(["eval-failed-fallback", ...reasons]);

  // Grounded + clean → high personalization. Evidence = exactly what was cited.
  const cited = new Set(result.value.citedIds);
  return {
    body: assembleBody(deps.assets, result.value.line.trim()),
    subject: result.value.subject,
    evidence: usable.filter((c) => cited.has(c.id)),
    personalization_level: "high",
    roleClass: deps.roleClass,
    lang: deps.lang,
    flags: [],
  };
}
