/**
 * Call sprint — the founder playbook's "sprint mono-secteur" made executable.
 *
 * A sprint is a campaign-level AUDIENCE (industries × personas) stored in
 * callCampaigns.targetFilter.audience and honoured by the daily-list top-up:
 * fresh targets come from the sprint only, while retries already in cadence
 * keep their committed schedule (a started cadence is never abandoned
 * mid-window because the rep changed sector).
 *
 * Resolution is deterministic over STORED columns — companies.industry
 * labels and the contacts' resolved persona cache
 * (properties.title_personas.p) — never over free text at query time. The
 * LLM appears in exactly two places, both fail-closed and validated verbatim
 * against the tenant's real labels (the matchIndustries pattern — no
 * hardcoded synonym lists, _specs note in lib/search/industry-match.ts):
 *   1. split the rep's phrase into a sector facet and a persona facet;
 *   2. map the persona facet onto the active ICPs' persona vocabulary.
 * An unresolved facet is simply absent from the audience — never invented.
 */

import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { matchIndustries } from "@/lib/search/industry-match";
import { personaVocabulary } from "@/lib/scoring/title-persona";
import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import { norm } from "@/lib/icp/criteria-engine";

// Pure slice (type + targetFilter parser) lives in ./sprint-audience so the
// cockpit chip (client) shares the SSOT without pulling in db imports.
import { readSprintAudience, type SprintAudience } from "./sprint-audience";
export { readSprintAudience, type SprintAudience };

/**
 * The SQL conditions an audience adds to a query whose FROM is the drizzle
 * `contacts` table (daily top-up + honest counts share these — by
 * construction what gets counted is what gets listed).
 *
 * Column refs inside subqueries are written as literal qualified names
 * ("contacts"."company_id") — a `${contacts.col}` interpolation renders
 * unqualified and can bind to the inner table (silent-zero footgun).
 */
export function sprintAudienceConditions(audience: SprintAudience): SQL[] {
  // NB: drizzle expands `${array}` into a parenthesised tuple — `(a,b)::text[]`
  // is invalid SQL. Build explicit IN-lists / ARRAY[...] with sql.join so every
  // value stays a bound parameter (caught live by _verify-call-sprint.ts).
  const conds: SQL[] = [];
  if (audience.industries.length > 0) {
    const lowered = sql.join(
      audience.industries.map((i) => sql`${i.toLowerCase()}`),
      sql`, `,
    );
    conds.push(sql`EXISTS (
      SELECT 1 FROM companies sc
      WHERE sc.id = "contacts"."company_id"
        AND sc.deleted_at IS NULL
        AND lower(sc.industry) IN (${lowered})
    )`);
  }
  if (audience.personas.length > 0) {
    const labels = sql.join(
      audience.personas.map((p) => sql`${p}`),
      sql`, `,
    );
    conds.push(
      sql`("contacts"."properties" -> 'title_personas' -> 'p') ?| ARRAY[${labels}]::text[]`,
    );
  }
  // R4.4 — buying-signal facet: contacts.properties.latestSignal.type ∈ signals.
  if (audience.signals && audience.signals.length > 0) {
    const vals = sql.join(audience.signals.map((s) => sql`${s}`), sql`, `);
    conds.push(sql`("contacts"."properties" -> 'latestSignal' ->> 'type') IN (${vals})`);
  }
  // R4.14 — phone-type facet: contacts.properties.phoneType ∈ phoneType.
  if (audience.phoneType && audience.phoneType.length > 0) {
    const vals = sql.join(audience.phoneType.map((s) => sql`${s}`), sql`, `);
    conds.push(sql`("contacts"."properties" ->> 'phoneType') IN (${vals})`);
  }
  // R4.13 — ICP fit floor.
  if (typeof audience.fitMin === "number") {
    conds.push(sql`"contacts"."score" >= ${audience.fitMin}`);
  }
  // R4.12 — sourcing freshness: enriched within the last N days.
  if (typeof audience.freshnessDays === "number") {
    conds.push(sql`"contacts"."last_enriched_at" >= now() - (${audience.freshnessDays} * interval '1 day')`);
  }
  // R4.6 — has a live linked deal worth >= dealValueMin. Literal-qualified
  // "contacts"."id" so the correlated subquery binds to the OUTER contacts row
  // (a ${contacts.id} interpolation would render unqualified — silent-zero).
  if (typeof audience.dealValueMin === "number") {
    conds.push(sql`EXISTS (
      SELECT 1 FROM deals d
      WHERE d.contact_id = "contacts"."id"
        AND d.deleted_at IS NULL
        AND d.value >= ${audience.dealValueMin}
    )`);
  }
  return conds;
}

function sprintModel() {
  return process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
}

export interface SprintFacets {
  sectorQuery: string | null;
  personaQuery: string | null;
}

/**
 * LLM step 1 — split the rep's phrase into the two facets the stored data
 * can answer. No labels are produced here, only wording. Fail-closed to
 * { null, null } (no model, error): the caller then reports "unresolved".
 */
export async function parseSprintFacets(phrase: string, tenantId: string): Promise<SprintFacets> {
  const model = sprintModel();
  if (!model || !phrase.trim()) return { sectorQuery: null, personaQuery: null };
  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: z.object({
        sectorQuery: z
          .string()
          .nullable()
          .describe("The industry/sector part of the target, reworded as a short search ('EMS et cliniques', 'fintech'), or null if none"),
        personaQuery: z
          .string()
          .nullable()
          .describe("The role/persona part of the target ('directeur général et DAF', 'CTO'), or null if none"),
      }),
      prompt: `A salesperson describes a calling-sprint target: "${phrase}".

Split it into the two facets a CRM can filter on:
- sectorQuery: the company sector/industry wording, if any (e.g. "les EMS romands" -> "EMS / établissements médico-sociaux"; "des fintechs" -> "fintech").
- personaQuery: the person role/title wording, if any (e.g. "les DG et DAF" -> "directeur général, directeur financier"; "CTO" -> "CTO").
Geography words (romand, vaudois...) belong to NEITHER facet — drop them. A facet that is not present in the phrase is null. Keep facets in the phrase's language.`,
      _trace: { agentId: "call-sprint-facets", tenantId, inputPreview: phrase.slice(0, 120) },
    });
    const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return { sectorQuery: clean(object.sectorQuery), personaQuery: clean(object.personaQuery) };
  } catch {
    return { sectorQuery: null, personaQuery: null };
  }
}

/**
 * LLM step 2 — map persona wording onto the active ICPs' persona vocabulary.
 * Output is filtered verbatim against the vocabulary (canonical casing);
 * anything outside it is dropped. Fail-closed to [].
 */
export async function resolvePersonaLabels(
  query: string,
  vocab: string[],
  tenantId: string,
): Promise<string[]> {
  const distinct = [...new Set(vocab.filter(Boolean))];
  if (distinct.length === 0 || !query.trim()) return [];
  const model = sprintModel();
  if (!model) return [];
  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: z.object({
        personas: z
          .array(z.string())
          .describe("Persona labels copied verbatim from the provided vocabulary whose FUNCTION matches the query; empty when none"),
      }),
      prompt: `A salesperson targets people described as: "${query}".

These are the EXACT persona labels available (the CRM's vocabulary):
${distinct.map((v) => `- ${v}`).join("\n")}

Return the subset (verbatim) whose FUNCTION matches, across languages — "directeur général" / "DG" / "Geschäftsführer" match CEO-like labels; "directeur informatique" matches IT-director-like labels. Seniority alone is not a match. Only labels that appear verbatim in the list.`,
      _trace: { agentId: "call-sprint-personas", tenantId, inputPreview: query.slice(0, 120) },
    });
    const byNorm = new Map(distinct.map((v) => [norm(v), v]));
    return [
      ...new Set(
        ((object.personas as string[]) || [])
          .map((p) => byNorm.get(norm(p)))
          .filter((p): p is string => !!p),
      ),
    ];
  } catch {
    return [];
  }
}

/** The tenant's real industry labels (live companies only). */
async function distinctIndustries(tenantId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ industry: companies.industry })
    .from(companies)
    .where(
      and(
        eq(companies.tenantId, tenantId),
        isNull(companies.deletedAt),
        sql`${companies.industry} IS NOT NULL AND ${companies.industry} <> ''`,
      ),
    );
  return rows.map((r) => r.industry as string).filter(Boolean);
}

export interface ResolvedSprint {
  audience: SprintAudience;
  facets: SprintFacets;
}

/** Phrase → validated audience (either facet may come back empty). */
export async function resolveSprintAudience(phrase: string, tenantId: string): Promise<ResolvedSprint> {
  const facets = await parseSprintFacets(phrase, tenantId);
  let industries: string[] = [];
  if (facets.sectorQuery) {
    industries = await matchIndustries(facets.sectorQuery, await distinctIndustries(tenantId), tenantId);
  }
  let personas: string[] = [];
  if (facets.personaQuery) {
    const vocab = personaVocabulary(await loadActiveIcps(tenantId));
    personas = await resolvePersonaLabels(facets.personaQuery, vocab, tenantId);
  }
  return {
    audience: { label: phrase.trim().slice(0, 120) || "sprint", industries, personas },
    facets,
  };
}

/**
 * Re-validate labels a caller passes back (e.g. the chat model echoing a
 * proposal): keep only labels that exist verbatim in the stored data /
 * vocabulary, in canonical casing. Unknown labels are dropped, not guessed.
 */
export async function validateSprintLabels(
  tenantId: string,
  industries: string[],
  personas: string[],
): Promise<{ industries: string[]; personas: string[] }> {
  const out: { industries: string[]; personas: string[] } = { industries: [], personas: [] };
  if (industries.length > 0) {
    const byLower = new Map(
      (await distinctIndustries(tenantId)).map((i) => [i.trim().toLowerCase(), i]),
    );
    out.industries = [
      ...new Set(
        industries
          .map((i) => byLower.get(i.trim().toLowerCase()))
          .filter((i): i is string => !!i),
      ),
    ];
  }
  if (personas.length > 0) {
    const vocab = personaVocabulary(await loadActiveIcps(tenantId));
    const byNorm = new Map(vocab.map((v) => [norm(v), v]));
    out.personas = [
      ...new Set(personas.map((p) => byNorm.get(norm(p))).filter((p): p is string => !!p)),
    ];
  }
  return out;
}

/**
 * The sprint contacts the enrichment wave should target: in the audience,
 * live, and missing a phone — highest ICP fit first. Capped (FullEnrich
 * bulk takes 100 max; Lusha-class daily quotas are the real ceiling).
 */
export async function listSprintContactsMissingPhone(
  tenantId: string,
  audience: SprintAudience,
  limit = 50,
): Promise<Array<{ id: string }>> {
  return db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        isNull(contacts.deletedAt),
        sql`(${contacts.phone} IS NULL OR ${contacts.phone} = '')`,
        ...sprintAudienceConditions(audience),
      ),
    )
    .orderBy(desc(contacts.score))
    .limit(Math.min(100, Math.max(1, limit)));
}

export interface SprintCounts {
  /** Live contacts matching the audience. */
  total: number;
  /** ...of which have a phone number. */
  withPhone: number;
  /** ...of which are actually listable now (phone, not DNC, not already in an active campaign). */
  callable: number;
}

/**
 * Honest counts for an audience — the same conditions the daily top-up
 * applies, so the preview never promises contacts the list can't draw.
 */
export async function countSprintAudience(
  tenantId: string,
  audience: SprintAudience,
): Promise<SprintCounts> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      withPhone: sql<number>`count(*) FILTER (WHERE ${contacts.phone} IS NOT NULL AND ${contacts.phone} <> '')::int`,
      callable: sql<number>`count(*) FILTER (WHERE ${contacts.phone} IS NOT NULL AND ${contacts.phone} <> ''
        AND NOT EXISTS (
          SELECT 1 FROM do_not_call_list d
          WHERE d.phone_number = "contacts"."phone"
            AND (d.tenant_id = ${tenantId} OR d.tenant_id IS NULL)
        )
        AND "contacts"."id" NOT IN (
          SELECT t.contact_id FROM call_campaign_targets t
          JOIN call_campaigns cc ON cc.id = t.campaign_id
          WHERE cc.tenant_id = ${tenantId} AND cc.status = 'active'
        ))::int`,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        isNull(contacts.deletedAt),
        ...sprintAudienceConditions(audience),
      ),
    );
  return {
    total: Number(row?.total ?? 0),
    withPhone: Number(row?.withPhone ?? 0),
    callable: Number(row?.callable ?? 0),
  };
}
