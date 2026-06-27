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

/** Evidence confidence floor for grounding. Exported so the evidence adapter can
 *  keep model-synthesized prose strictly below it (never-invent). */
export const DEFAULT_MIN_CONFIDENCE = 0.6;
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
 * Self-referential seller brags — the line is about how great WE are, not what's
 * in it for THEM. FR + EN. High-precision (only unambiguous claims).
 */
// NB: avoid a TRAILING `\b` right after an accented char (é) — JS `\b` uses an
// ASCII word definition, so é reads as a non-word char and the boundary fails
// ("levé" wouldn't match). Same for a LEADING `\b` before `#`.
const SELLER_BRAG: RegExp[] = [
  /(num(é|e)ro|n[°o]|#)\s*1\b/i,
  /\b(le|la|the)\s+leader\b/i,
  /\bleaders?\s+(du\s+march(é|e)|mondial|on\s+the\s+market|in\s+(the\s+)?(market|industry))/i,
  /\b(meilleur(e)?|best)\s+(solution|produit|product|outil|tool|plateforme|platform)/i,
  /\bindustry[-\s]leading\b/i,
  /\b(la\s+seule|le\s+seul|the\s+only)\s+(solution|plateforme|platform|outil|tool)/i,
];
/** A funding mention (FR + EN). Congrats on a raise is fine ON ITS OWN. */
const FUNDING_MENTION = /\b(lev[ée]|rais(e|ed)|funding|s(é|e)rie\s*[abc]|series\s*[abc]|tour\s+de\s+table|seed)/i;
/** A sales push — pitching the sender's product/price/demo. */
const SALES_PUSH = /\b(achet|souscri|abonn|notre\s+(offre|produit|solution|plateforme|outil|service)|our\s+(product|offer|solution|platform|tool|service)|tarif|pricing|essai\s+gratuit|free\s+trial|d(é|e)mo\s+de\s+notre|book\s+a\s+demo)\b/i;

/**
 * Recipient-benefit guard (the Monaco rule the proven templates embody): a line
 * must serve the reader, never brag about the sender or use a milestone as a
 * pretext to pitch. Two outright rejections (→ the clean segment fallback ships
 * instead, surfaced via flags):
 *   - "seller-benefit": a self-referential brag (#1 / the leader / best tool / …).
 *   - "funding-pitch":  a funding mention AND a sales push in the SAME line
 *     ("you raised … buy our thing"). Congrats alone never trips it — the
 *     post-funding template is deliberately congrats-only.
 * Deterministic + high-precision so it rarely false-positives. `lang` is reserved
 * for future per-language tuning; the patterns are bilingual today.
 */
export function recipientBenefitViolations(line: string, _lang: Lang): string[] {
  const reasons: string[] = [];
  if (SELLER_BRAG.some((re) => re.test(line))) reasons.push("seller-benefit");
  if (FUNDING_MENTION.test(line) && SALES_PUSH.test(line)) reasons.push("funding-pitch");
  return reasons;
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
  // Recipient-benefit floor — reject seller-brag / funding-as-pitch (Monaco rule).
  reasons.push(...recipientBenefitViolations(value.line, deps.lang));
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

  // A message whose assembled body is empty/whitespace is NOT sendable copy — it
  // means there are no copy assets (and no grounded line). Flag it `no-body` so the
  // eval gate + the enroll/send path can refuse a blank instead of shipping it.
  const withBodyGuard = (m: Message): Message =>
    m.body.trim().length === 0 ? { ...m, flags: [...m.flags, "no-body"] } : m;

  const fallback = (flags: string[]): Message =>
    withBodyGuard({
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
  return withBodyGuard({
    body: assembleBody(deps.assets, result.value.line.trim()),
    // Normalize an empty/whitespace model subject to undefined so the cutover sites'
    // `message.subject ?? legacySubject` falls back to the legacy subject instead of
    // clobbering it with a blank line. A high-personalization BODY is still shipped.
    subject: result.value.subject?.trim() || undefined,
    evidence: usable.filter((c) => cited.has(c.id)),
    personalization_level: "high",
    roleClass: deps.roleClass,
    lang: deps.lang,
    flags: [],
  });
}
