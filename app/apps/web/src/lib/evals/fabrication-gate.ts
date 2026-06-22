/**
 * Anti-fabrication gate — the blocking enforcement the blind-grade eval proved we
 * need. When the research brief is thin, the generator invents plausible specifics
 * (named tech stacks, prospect-specific counts) that read as fabricated to a real
 * recipient (blind judges flagged exactly this on the Bricks.co case: an invented
 * n8n/Supabase/Keycloak stack with no supporting facts).
 *
 * Two layers, both pure-ish:
 *  1. DETERMINISTIC (always, free, HIGH-PRECISION): only fires when the brief has
 *     ZERO sourced facts — then the email must stay generic, so ANY hard specific
 *     (a count >= 100, a named third-party tool, an ALLCAPS+year event) is by
 *     definition ungrounded. This is the clean catch for the empty-brief case and
 *     deliberately does NOT second-guess numbers when a brief exists (a real
 *     crawled "3,848 projects" must not be punished).
 *  2. SEMANTIC (opt-in): the LLM judge's per-claim verdicts (judgeFabrication /
 *     judgePersonalization) feed `semanticClaims`; any `grounded:false` claim is
 *     added. This handles the nuanced non-empty-brief cases with reasoning.
 *
 * The gate returns `blocked` + the offending specifics so the generator's
 * evaluator-optimizer loop can regenerate WITHOUT them (feedback), and the final
 * draft can be held if fabrication survives.
 */

import type { ResearchBriefContext } from "@/lib/context/prospect-context";
import type { FirmographicFacts } from "@/lib/campaign-engine/types";
import type { ClaimVerdict } from "./personalization-judge";

export interface FabricationInput {
  body: string;
  brief?: ResearchBriefContext;
  prospect: { name?: string | null; title?: string | null; company?: string | null; domain?: string | null };
  /** Optional — per-claim verdicts from the semantic judge (grounded:false = fabricated). */
  semanticClaims?: ClaimVerdict[];
}

export interface FabricationVerdict {
  blocked: boolean;
  ungrounded: string[];
  reason: string;
  /** Whether the brief carried any sourced fact (drives the deterministic layer). */
  briefHasFacts: boolean;
}

/** True when firmographics carry at least one citable fact (mirrors build-intelligence-brief). */
function firmographicsHaveSignal(f: FirmographicFacts | null | undefined): boolean {
  if (!f) return false;
  return (
    f.employeeCount != null || f.sizeRange != null || f.fundingStage != null ||
    f.totalFunding != null || f.annualRevenue != null || f.revenueRange != null ||
    f.foundedYear != null || f.industry != null || (f.investors?.length ?? 0) > 0 ||
    (f.technologies?.length ?? 0) > 0 || f.city != null || f.country != null
  );
}

/** Sync mirror of briefIsEmpty (inverted) — avoids importing the DB-heavy module. */
export function briefHasSourcedFacts(brief?: ResearchBriefContext): boolean {
  if (!brief) return false;
  return (
    !!brief.bestAngle ||
    (brief.painPoints?.length ?? 0) > 0 ||
    !!brief.competitorDetected ||
    (brief.publicContent?.length ?? 0) > 0 ||
    (brief.warmthSignals?.length ?? 0) > 0 ||
    firmographicsHaveSignal(brief.firmographics?.facts)
  );
}

/** Common count-nouns that turn a bare number into a prospect-specific claim. */
const COUNT_NOUNS =
  "projects|projets|contracts|contrats|clients|customers|employees|employ[ée]s|personnes|people|members|membres|nations|countries|pays|users|utilisateurs|seats|sites|locations|offices|bureaux|stores|magasins|deals|accounts|leads|teams|[ée]quipes|developers|engineers|branches|agences|partners|partenaires";

/** Named third-party tools that, asserted about an unknown prospect, read as invented. */
const TECH_DICT = [
  "keycloak", "supabase", "n8n", "nocodb", "mattermost", "notion", "airtable", "slack",
  "salesforce", "hubspot", "snowflake", "metabase", "superset", "postgres", "postgresql",
  "kubernetes", "mongodb", "datadog", "segment", "looker", "tableau", "zendesk", "intercom",
  "nextcloud", "jira", "confluence", "okta", "auth0", "stripe", "twilio", "grafana",
];

function normNum(s: string): string {
  return s.replace(/\D/g, "");
}

export interface HardSpecifics {
  numbers: string[];
  techTokens: string[];
  events: string[];
}

/** Extract the specifics that an unknown-prospect email has no right to assert. */
export function extractHardSpecifics(body: string): HardSpecifics {
  const numbers = new Set<string>();
  // 3+ digit runs, or thousands-separated groups (3,848 / 3 848 / 3.848).
  const numRe = /\b\d{1,3}(?:[., \s]\d{3})+\b|\b\d{3,}\b/g;
  let m: RegExpExecArray | null;
  while ((m = numRe.exec(body))) numbers.add(m[0]);
  // any number directly qualifying a count-noun (catches "12 agences", "81 nations").
  const countRe = new RegExp(`\\b(\\d[\\d.,\\u202f\\s]*)\\s*(?:${COUNT_NOUNS})\\b`, "giu");
  while ((m = countRe.exec(body))) numbers.add(m[1].trim());

  const low = body.toLowerCase();
  const techTokens = TECH_DICT.filter((t) => new RegExp(`(?:^|[^a-z0-9])${t}(?:[^a-z0-9]|$)`, "i").test(low));

  const events = new Set<string>();
  const evRe = /\b[A-Z]{2,}[\s-]?\d{2,4}\b/g;
  while ((m = evRe.exec(body))) events.add(m[0]);

  return { numbers: [...numbers], techTokens, events: [...events] };
}

function buildGroundTruth(input: FabricationInput): string {
  const parts: string[] = [];
  const p = input.prospect;
  for (const v of [p.name, p.title, p.company, p.domain]) if (v) parts.push(v);
  const b = input.brief;
  if (b) {
    if (b.bestAngle) parts.push(b.bestAngle);
    parts.push(...(b.painPoints ?? []));
    if (b.competitorDetected) parts.push(b.competitorDetected);
    for (const pc of b.publicContent ?? []) parts.push(pc.title ?? "", pc.quote ?? "");
    for (const w of b.warmthSignals ?? []) parts.push(w.detail ?? "");
    const f = b.firmographics?.facts;
    if (f) {
      for (const v of Object.values(f)) {
        if (Array.isArray(v)) parts.push(...v.map(String));
        else if (v != null) parts.push(String(v));
      }
    }
  }
  return parts.join(" \n ").toLowerCase();
}

/**
 * Decide whether the email asserts specifics it cannot stand behind. Deterministic
 * layer fires only on an empty brief; the semantic layer (if supplied) adds any
 * judge-flagged ungrounded claim regardless.
 */
export function decideFabricationGate(input: FabricationInput): FabricationVerdict {
  const briefHasFacts = briefHasSourcedFacts(input.brief);
  const gt = buildGroundTruth(input);
  const gtDigits = normNum(gt);
  const ungrounded = new Set<string>();

  if (!briefHasFacts) {
    const { numbers, techTokens, events } = extractHardSpecifics(input.body);
    for (const n of numbers) if (normNum(n) && !gtDigits.includes(normNum(n))) ungrounded.add(n);
    for (const t of techTokens) if (!gt.includes(t)) ungrounded.add(t);
    for (const e of events) if (!gt.includes(e.toLowerCase())) ungrounded.add(e);
  }

  for (const c of input.semanticClaims ?? []) {
    if (c && c.grounded === false && c.text) ungrounded.add(c.text);
  }

  const list = [...ungrounded];
  return {
    blocked: list.length > 0,
    ungrounded: list,
    reason: list.length
      ? `unverifiable specifics not supported by research: ${list.slice(0, 6).join(", ")}`
      : "no fabrication detected",
    briefHasFacts,
  };
}

/**
 * SEMANTIC layer — the LLM judge for the non-empty-brief case. Reuses the
 * personalization judge but with a fact sheet that now includes firmographics +
 * prospect identity, and (unlike the score path) does NOT skip when the brief is
 * sparse — a sparse sheet simply means most specifics come back ungrounded.
 * Fail-open: any error / missing key → no claims (deterministic layer still runs).
 */
export async function judgeFabrication(
  body: string,
  brief: ResearchBriefContext | undefined,
  prospect: FabricationInput["prospect"],
): Promise<ClaimVerdict[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  try {
    const { formatBriefFacts } = await import("./personalization-judge");
    const { generateText } = await import("ai");
    const { getModelForTask } = await import("@/lib/ai/ai-provider");
    const model = getModelForTask("lightweight");
    if (!model) return [];
    const identity = [
      prospect.name && `Name: ${prospect.name}`,
      prospect.title && `Title: ${prospect.title}`,
      prospect.company && `Company: ${prospect.company}`,
      prospect.domain && `Domain: ${prospect.domain}`,
    ].filter(Boolean).join("\n");
    const factSheet = `${identity}\n${brief ? formatBriefFacts(brief) : ""}`.trim() || "(no verified facts)";
    const prompt = `You are auditing a cold email for FABRICATED specifics.

VERIFIED FACTS (the ONLY facts the email may assert about the prospect):
${factSheet}

EMAIL BODY:
${body.slice(0, 2000)}

Extract every SPECIFIC factual claim the email makes about the prospect or their company (named tools they use, headcount/revenue/funding figures, named initiatives/events, client counts). Ignore greetings, the sender's own product description, generic value props, and the CTA. For each claim decide grounded=true ONLY if a verified fact above supports it; a plausible but unlisted claim is grounded=false.

Return STRICT JSON only: {"claims":[{"text":"<claim>","grounded":true|false,"evidence":"<supporting fact or null>"}]}`;
    const res = await generateText({
      model: model as unknown as Parameters<typeof generateText>[0]["model"],
      maxOutputTokens: 700,
      prompt,
    });
    const match = res.text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as { claims?: ClaimVerdict[] };
    return Array.isArray(parsed.claims) ? parsed.claims : [];
  } catch {
    return [];
  }
}
