/**
 * Spec 20 — deterministic QC gate + computed send-eligibility. The last line
 * before a message can reach a sequence: a variant is send-eligible only when it
 * PASSES QC and (when the campaign is gated) is approved. Send-eligibility is a
 * computed flag, never set by hand (AC5).
 *
 * QC composes the merged spam/length heuristic (lib/emails/email-spam-check)
 * with the spec-20-specific checks: single link, cold-outbound length, plain
 * text, grounding-trace, and brand (no em-dashes; FR vouvoiement). All pure and
 * unit-tested. Blast radius: copy/variants/* only.
 */

import { checkSpamSignals, type SpamCheckResult } from "@/lib/emails/email-spam-check";

export type PersonalizationLevel = "high" | "low";
export type Lang = "en" | "fr";

/** The fields QC reads off a variant (structural — spec-19 Message-shaped). */
export interface QcInput {
  body: string;
  subject?: string;
  /** Cited evidence (ids suffice for the grounding-trace check). */
  evidence: { id: string }[];
  personalization_level: PersonalizationLevel;
}

export interface QcOptions {
  /** Brand banned tokens (spec-18 bannedSet). Em-dashes are always banned. */
  banned?: string[];
  lang?: Lang;
  frFormality?: "vouvoiement" | "tutoiement";
  /** Max links in the body (deliverability: single link). Default 1. */
  maxLinks?: number;
  /** Cold-outbound body length window (trimmed chars). Defaults 40..1200. */
  minChars?: number;
  maxChars?: number;
  /** Spam score at/above which QC fails. Default 50 (medium). */
  maxSpamScore?: number;
}

export interface QcChecks {
  spam: boolean;
  links: boolean;
  length: boolean;
  plainText: boolean;
  grounding: boolean;
  brand: boolean;
}

export interface QcResult {
  passed: boolean;
  failures: string[];
  checks: QcChecks;
  spam: SpamCheckResult;
}

const ALWAYS_BANNED = ["—", "–", "--"]; // AC2 brand: no em-dashes
const FR_INFORMAL = /\b(tu|ton|ta|tes|toi|t'es)\b/i;

/** Count links the way deliverability does: raw URLs + anchors + markdown links. */
export function countLinks(body: string): number {
  const urls = body.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  const anchors = body.match(/<a\s[^>]*href=/gi) ?? [];
  const markdown = body.match(/\]\([^)]+\)/g) ?? [];
  return urls.length + anchors.length + markdown.length;
}

/** Brand tokens / em-dashes present in `text` (case-insensitive). */
export function brandViolations(text: string, banned: string[]): string[] {
  const lower = text.toLowerCase();
  return [...new Set([...banned, ...ALWAYS_BANNED])].filter((b) => b && lower.includes(b.toLowerCase()));
}

/** Run deterministic QC on a variant. Pure; stable on re-run (AC2/AC5). */
export function runQc(input: QcInput, opts: QcOptions = {}): QcResult {
  const body = (input.body ?? "").trim();
  const subject = input.subject ?? "";
  const banned = opts.banned ?? [];
  const maxLinks = opts.maxLinks ?? 1;
  const minChars = opts.minChars ?? 40;
  const maxChars = opts.maxChars ?? 1200;
  const maxSpamScore = opts.maxSpamScore ?? 50;

  const spam = checkSpamSignals(subject, body);
  const failures: string[] = [];

  const spamOk = spam.score < maxSpamScore;
  if (!spamOk) failures.push(`spam:${spam.warnings.map((w) => w.code).join("|")}`);

  const linksOk = countLinks(body) <= maxLinks;
  if (!linksOk) failures.push("links:more-than-one");

  const lengthOk = body.length >= minChars && body.length <= maxChars;
  if (!lengthOk) failures.push(body.length < minChars ? "length:too-short" : "length:too-long");

  // Plain-text-friendly: reject HTML markup.
  const plainTextOk = !/<[a-z][\s\S]*>/i.test(body);
  if (!plainTextOk) failures.push("plain-text:html");

  // Grounding-trace: a high-personalization variant must carry cited evidence.
  const groundingOk = input.personalization_level !== "high" || input.evidence.length > 0;
  if (!groundingOk) failures.push("grounding:high-without-evidence");

  // Brand: no em-dashes / banned words; FR vouvoiement.
  const brand = brandViolations(`${subject}\n${body}`, banned);
  const frInformal = opts.lang === "fr" && (opts.frFormality ?? "vouvoiement") === "vouvoiement" && FR_INFORMAL.test(body);
  const brandOk = brand.length === 0 && !frInformal;
  if (!brandOk) failures.push(`brand:${[...brand, ...(frInformal ? ["fr-informal"] : [])].join("|")}`);

  const checks: QcChecks = { spam: spamOk, links: linksOk, length: lengthOk, plainText: plainTextOk, grounding: groundingOk, brand: brandOk };
  return { passed: failures.length === 0, failures, checks, spam };
}

export type ApprovalMode = "autonomous" | "gated";
export interface ApprovalState {
  mode: ApprovalMode;
  /** Only consulted when mode is "gated". */
  approved?: boolean;
}

/**
 * AC3/AC5 — computed send-eligibility: QC must pass AND, when the campaign is
 * gated, the variant must be approved. Never set by hand.
 */
export function sendEligible(qc: QcResult, approval: ApprovalState): boolean {
  if (!qc.passed) return false;
  return approval.mode === "autonomous" ? true : approval.approved === true;
}
