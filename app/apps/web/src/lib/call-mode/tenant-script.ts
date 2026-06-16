/**
 * Per-tenant call script: load (persisted or default), generate (LLM from the
 * tenant's product + ICP), and upsert (rep edits). Keeps the hardcoded content
 * out of the cockpit — `lib/call-mode/call-scripts.ts` stays pure and only
 * supplies the editable DEFAULTS this layer falls back to.
 */

import { db } from "@/db";
import { callScripts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { defaultScriptFields, defaultScriptFieldsForKey, type ScriptFields } from "./call-scripts";
import type { GenEvidenceItem } from "./prospect-evidence";

/** One generated enjeu: prospect-grounded iff it cites an evidence id. */
export interface GeneratedProblem {
  text: string;
  /** The GenEvidenceItem.id this enjeu is grounded on, or null = sector-generic. */
  evidenceRef: string | null;
}

/** Review-time note the panel shows under a grounded enjeu ("Ancré : …"). */
export interface GroundingNote {
  /** Index into the returned problems array. */
  index: number;
  fact: string;
}

/**
 * Fail-closed citation filter — the contract that makes the generation
 * grounded instead of plausible: an enjeu citing an id that is NOT in the
 * evidence is DROPPED (never shown, never said). Null-ref enjeux pass as
 * sector-generic. Pure + unit-tested.
 */
export function filterGroundedProblems(
  problems: GeneratedProblem[],
  evidence: GenEvidenceItem[],
): { kept: string[]; grounding: GroundingNote[] } {
  const byId = new Map(evidence.map((e) => [e.id, e.fact]));
  const kept: string[] = [];
  const grounding: GroundingNote[] = [];
  for (const p of problems) {
    const text = (p.text ?? "").trim();
    if (!text) continue;
    if (p.evidenceRef == null) {
      kept.push(text);
      continue;
    }
    const fact = byId.get(p.evidenceRef);
    if (!fact) continue; // bogus citation → dropped, fail-closed
    grounding.push({ index: kept.length, fact });
    kept.push(text);
  }
  return { kept, grounding };
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

/**
 * Format the founder's editable cold-call playbook into a capped prompt
 * block. The caller passes the STAGE-selected entries (the "cold_call"
 * pull from tenant Knowledge, global excluded — company context already
 * rides in via tenant settings). "" when nothing is given — the hardcoded
 * methodology alone then governs. The block refines wording/phases; the
 * grounding rules (evidence citations, fail-closed filter) always take
 * precedence. Pure + tested.
 */
export function buildPlaybookBlock(
  entries: Array<{ topic: string; content: string }>,
  cap = 3500,
): string {
  if (entries.length === 0) return "";
  const seen = new Set<string>();
  let body = "";
  for (const e of entries) {
    const key = e.topic.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const next = `\n- ${e.topic.trim()}: ${e.content.replace(/\s+/g, " ").trim()}`;
    if (body.length + next.length > cap) break;
    body += next;
  }
  if (!body) return "";
  return `\n\nFOUNDER COLD-CALL PLAYBOOK (the tenant's own methodology, editable in Settings → Knowledge — follow its phases and wording wherever it is more specific than the methodology above; it NEVER overrides the grounding rules):${body}`;
}

export interface StoredScript extends ScriptFields {
  sector: string;
  origin: string;
}

/**
 * The script in effect for a (tenant, sector): an exact sector variant if one
 * exists, else the tenant default ('' sector), else the code defaults seeded
 * with the best sector match. Never throws — the cockpit always gets a script.
 */
export async function loadTenantScript(tenantId: string, sector?: string | null, defaultKey?: string | null): Promise<StoredScript> {
  const key = norm(sector);
  const rows = await db.select().from(callScripts).where(eq(callScripts.tenantId, tenantId));
  const exact = key ? rows.find((r) => r.sector === key) : undefined;
  const def = rows.find((r) => r.sector === "");
  const row = exact ?? def;
  if (row) {
    return {
      opener: row.opener,
      problems: row.problems ?? [],
      permissionCheck: row.permissionCheck,
      bookingAsk: row.bookingAsk,
      guidance: row.guidance ?? [],
      sector: row.sector,
      origin: row.origin,
    };
  }
  // No saved script → defaults for the resolved key (from the signal waterfall),
  // else fall back to substring on the sector string.
  const fields = defaultKey ? defaultScriptFieldsForKey(defaultKey) : defaultScriptFields(sector);
  return { ...fields, sector: key, origin: "default" };
}

/** Save the rep's script for a (tenant, sector). Upsert on the unique key. */
export async function upsertTenantScript(args: {
  tenantId: string;
  userId?: string | null;
  sector?: string | null;
  fields: ScriptFields;
  origin?: string;
}): Promise<void> {
  const key = norm(args.sector);
  const f = args.fields;
  const [existing] = await db
    .select({ id: callScripts.id })
    .from(callScripts)
    .where(and(eq(callScripts.tenantId, args.tenantId), eq(callScripts.sector, key)))
    .limit(1);
  const values = {
    opener: f.opener,
    problems: f.problems,
    permissionCheck: f.permissionCheck,
    bookingAsk: f.bookingAsk,
    guidance: f.guidance,
    origin: args.origin ?? "edited",
    updatedBy: args.userId ?? null,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(callScripts).set(values).where(eq(callScripts.id, existing.id));
  } else {
    await db.insert(callScripts).values({ tenantId: args.tenantId, sector: key, ...values });
  }
}

/**
 * Generate a permission-based call script from the tenant's product + ICP via
 * an LLM — and, when `evidence` is provided (Étape D), grounded on THIS
 * prospect: any prospect-specific enjeu must cite an evidence id, uncited
 * claims are dropped (fail-closed, `filterGroundedProblems`). Posture is
 * consultative by default (sober, no contrarian reframe; tenant-overridable
 * via settings.scriptPosture). Returns a draft (not saved) + the grounding
 * notes the panel shows. Null when no model key is configured.
 */
export async function generateCallScript(
  tenantId: string,
  opts: { sector?: string | null; persona?: string | null; evidence?: GenEvidenceItem[] } = {},
): Promise<{ draft: ScriptFields; grounding: GroundingNote[] } | null> {
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return null;

  const s = await getTenantSettings(tenantId);

  // Founder playbook from tenant Knowledge — the "cold_call" stage pull
  // (lib/knowledge/stages.ts). Fail-soft: absent table, empty tenant or
  // read error all degrade to the hardcoded methodology.
  let playbookBlock = "";
  try {
    const { getTenantKnowledgeForStage } = await import("@/lib/knowledge/get-tenant-knowledge");
    playbookBlock = buildPlaybookBlock(
      await getTenantKnowledgeForStage(tenantId, "cold_call", { includeGlobal: false }),
    );
  } catch {
    playbookBlock = "";
  }

  const sector = (opts.sector ?? (s.targetIndustries ?? [])[0] ?? "").toString().trim();
  const evidence = opts.evidence ?? [];
  const posture = s.scriptPosture === "challenger" ? "challenger" : "consultative";
  const ctx = {
    product: s.productDescription ?? "",
    salesMotion: s.salesMotion ?? "",
    challenge: s.primaryChallenge ?? "",
    industries: s.targetIndustries ?? [],
    sizes: s.targetCompanySizes ?? [],
    geographies: s.targetGeographies ?? [],
    roles: s.targetRoles ?? "",
    technologies: s.targetTechnologies ?? [],
    sector,
    persona: opts.persona ?? s.targetRoles ?? "",
  };

  const evidenceBlock =
    evidence.length > 0
      ? `

PROSPECT EVIDENCE (the ONLY prospect facts that exist — cite by id):
${evidence.map((e) => `${e.id}: ${e.fact}`).join("\n")}

Grounding rules (hard): at least ONE enjeu must be specific to THIS prospect and cite the evidence id it is built on (set its evidenceRef). NEVER use a prospect fact without citing its id. NEVER invent prospect facts (no tools, signals, rounds or hires beyond the EVIDENCE list). Sector-generic enjeux keep evidenceRef = null.`
      : "";

  const postureLine =
    posture === "consultative"
      ? `Posture: consultative — sober and factual, no contrarian reframe, no pressure, no dramatization (this segment punishes sur-vente).`
      : `Posture: challenger — one contrarian, factual reframe is allowed if grounded; still no hype.`;

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: z.object({
        opener: z.string().describe("Opener: greeting + MINIMAL identity ('Martin Paviot, cofondateur de Pilae, une startup lausannoise') + the prospect's SECTOR tied to our subject (the {line} placeholder) + a permission ask ('je vous appelle pas pour vous dérouler un pitch, juste voir en deux minutes si c'est un sujet chez vous, ça vous convient ?'). MUST keep BOTH the {name} and {line} placeholders. NO self-description of the product, NEVER tell the buyer they overpay or are behind."),
        problems: z
          .array(
            z.object({
              text: z.string().describe("One of the 3 core enjeux as a RÉCIT-PAIR: a quoted peer voice (« Beaucoup nous disent : \"…\" ») then a two-door validation baked into the SAME string (« …, chez vous c'est déjà le cas, ou pas encore ? »). Never frontal, never accusatory — the prospect recognises himself. ONE at a time. Pilae's 3 angles, by maturity: terrain = IA arrivée par la bande / licences payées pour tout le monde / données hors-CH; orga mûre = retard IA / facture SaaS qui dérape / souveraineté."),
              evidenceRef: z.string().nullable().describe("The PROSPECT EVIDENCE id this enjeu is built on (e.g. 'E1'), or null when sector-generic."),
            }),
          )
          .min(1)
          .max(3),
        permissionCheck: z.string().describe("Leave EMPTY (\"\") — the validation now travels inside each enjeu (the two-door question). Only fill for a single shared fallback question."),
        bookingAsk: z.string().describe("Propose a 45 min-1h VIDEO meeting, offering TWO concrete time windows (e.g. 'lundi entre 14h et 18h, ou jeudi entre 9h et 12h'); de-risk it (rien à préparer, they leave with a costed read even without a follow-up). No phone discovery."),
      }),
      prompt: `Write a permission-based cold-call script in French (Suisse romande), for a salesperson selling this product:

PRODUCT: ${ctx.product || "(non renseigné)"}
SALES MOTION: ${ctx.salesMotion || "(n/a)"}
KEY CHALLENGE WE SOLVE: ${ctx.challenge || "(n/a)"}
TARGET SEGMENT — sector: ${ctx.sector || "(générique)"}; sizes: ${ctx.sizes.join(", ") || "n/a"}; geographies: ${ctx.geographies.join(", ") || "n/a"}; persona/roles: ${ctx.persona || "décideur"}; tech in place we replace: ${ctx.technologies.join(", ") || "n/a"}.${evidenceBlock}

Methodology (strict — founder cold call, Benjamin Douablin, adapted: NO discovery on the phone — the only job is to BOOK the meeting): short call (2-3 min). Flow: (1) OPENER = greeting + MINIMAL identity (just "une startup lausannoise", NO product description) + the prospect's SECTOR tied to our subject (the {line} placeholder, e.g. "je me concentre en ce moment sur les EMS romands : utiliser l'IA en interne sans que les données des résidents partent à l'étranger") + a permission ask ("je vous appelle pas pour un pitch, juste voir si c'est un sujet chez vous, ça vous convient ?"). The opener never pitches and NEVER tells the buyer he overpays or is behind; (2) after the OK, a half-sentence (IA interne / automatisations open source, hébergées en Suisse, à l'usage), then illuminate the pains through a RÉCIT-PAIR — a QUOTED peer voice ("Beaucoup nous disent : '…'"), never frontally — ONE enjeu at a time, each followed by a TWO-DOOR validation that lets the prospect place himself without judgment ("…, chez vous c'est déjà le cas, ou pas encore ?"); iterate up to 3, stop at the first that lands; (3) as soon as one lands, propose a 45 min-1h VIDEO meeting with two concrete time windows. ${postureLine} Ton suisse: sober, factual, modest, no number thrown on the phone, we propose and never lecture. Talk to decision-makers first. Use "vous". No emojis. Sound like a founder with one real reason to call, not a stack of techniques. Never claim a certification the company doesn't have. The opener MUST keep BOTH the {name} and {line} placeholders so they interpolate per call (do NOT put {sector}/{geo} in the opener, do NOT use {reason}).${playbookBlock}`,
      _trace: { agentId: "call-script-generate", tenantId, inputPreview: `${sector.slice(0, 60)}|ev:${evidence.length}|${posture}` },
    });

    // Fail-closed citation gate; if nothing survives, fall back to the
    // sector defaults rather than shipping an empty (or fabricated) list.
    const { kept, grounding } = filterGroundedProblems(object.problems, evidence);
    const problems = kept.length > 0 ? kept : defaultScriptFields(opts.sector).problems;
    return {
      draft: {
        opener: object.opener,
        problems,
        permissionCheck: object.permissionCheck,
        bookingAsk: object.bookingAsk,
        guidance: defaultScriptFields(opts.sector).guidance,
      },
      grounding: kept.length > 0 ? grounding : [],
    };
  } catch {
    return null;
  }
}
