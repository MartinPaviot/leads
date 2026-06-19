/**
 * Contact × ICP fit — score contacts against the tenant's ICP profiles
 * by REUSING the company criteria engine (computeBlendedFit) over a
 * merged context: the contact's company context (industry, size, geo,
 * revenue, …) plus the person dimension.
 *
 * Person fields:
 *   - person_seniorities IS scorable: both the criterion values and the
 *     contact's enriched `properties.seniority` are Apollo enums
 *     (c_suite, vp, director, …) the engine's norm() already equates.
 *   - person_titles IS scorable via title→persona resolution
 *     (lib/scoring/title-persona, _specs/title-persona-fit): free-text
 *     titles resolve to the ICPs' persona labels through a cached,
 *     verbatim-validated LLM step (literal membership is a no-LLM
 *     fast-path). An UNRESOLVED title (model down, not yet mapped)
 *     stays ABSENT from the context — no penalty, said in reasons —
 *     while a resolved-empty one is a true evaluated non-match.
 *   - hiring_job_titles stays sourcing-only (a company-search param,
 *     not a person attribute).
 *
 * Scale contract mirrors companies (icp-unification R1): per-ICP fits
 * stay [0,1] under contacts.properties.icp_fit; contacts.score is
 * round(100 × primary fit) so every 0-100 reader (grades, sort,
 * displayScore) keeps working. Batches write through ONE
 * jsonb_to_recordset UPDATE — the await-per-row loop is the
 * round-trip mistake the company recompute already paid for
 * (~3k round-trips; see fit-recompute-core).
 */

import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  computeBlendedFit,
  resolvePrimaryIcp,
  norm,
  type IcpFitCell,
} from "@/lib/icp/criteria-engine";
import { SOURCING_ONLY_FIELD_KEYS } from "@/lib/icp/field-catalog";
import { buildCompanyContext, customExtra, type CompanyContext } from "@/lib/icp/company-context";
import { PRIMARY_FIT_THRESHOLD, loadCustomFieldDefs, type ActiveIcp } from "@/lib/icp/fit-recompute-core";
import { getGrade } from "@/lib/scoring/scoring";
import {
  personaVocabulary,
  vocabHash,
  readCachedPersonas,
  resolveTitles,
} from "@/lib/scoring/title-persona";

export const CONTACT_SCORE_BATCH_SIZE = 100;

/** Person fields the CONTACT engine evaluates (the company engine
 *  excludes all of SOURCING_ONLY_FIELD_KEYS). */
export const CONTACT_SCORABLE_PERSON_FIELDS: ReadonlySet<string> = new Set([
  "person_seniorities",
  "person_titles",
]);

/** Sourcing-only set for contact scoring = the company set minus the
 *  person fields a contact context actually carries. */
export const CONTACT_SOURCING_ONLY: ReadonlySet<string> = new Set(
  [...SOURCING_ONLY_FIELD_KEYS].filter((k) => !CONTACT_SCORABLE_PERSON_FIELDS.has(k)),
);

export type ContactRowForFit = {
  properties?: Record<string, unknown> | null;
};

/**
 * Merge the person dimension into a company context. Keys are only set
 * when data exists, so the engine's "absent field leaves the
 * denominator" semantics keep un-enriched contacts unpenalised.
 */
export function buildContactContext(
  companyCtx: CompanyContext,
  contact: ContactRowForFit,
): CompanyContext {
  const ctx: CompanyContext = { ...companyCtx };
  const seniority = (contact.properties ?? {})["seniority"];
  if (typeof seniority === "string" && seniority.trim() !== "") {
    ctx.person_seniorities = [seniority];
  }
  return ctx;
}

/**
 * Whether any active ICP has a criterion the CONTACT engine can score
 * (company fields + person_seniorities). The company-side guard
 * (hasScorableCriteria) ignores ALL person fields, so a seniorities-only
 * "people ICP" is scorable here even though it isn't for companies.
 */
export function hasContactScorableCriteria(activeIcps: ActiveIcp[]): boolean {
  return activeIcps.some((icp) =>
    icp.criteria.some((c) => !CONTACT_SOURCING_ONLY.has(c.fieldKey)),
  );
}

export type ContactScoreBatchResult = { scored: number };

/**
 * Score contacts against every active ICP and persist: contacts.score
 * (0-100 mirror of the primary fit), score_reasons, and
 * properties.icp_fit { primaryIcpId, cells, scoredAt } + score_grade.
 * Self-chunks into CONTACT_SCORE_BATCH_SIZE slices — callers may pass
 * any id-list size. Three queries per chunk: contacts, their
 * companies, one bulk UPDATE.
 */
export async function scoreContactIcpBatch(
  tenantId: string,
  contactIds: string[],
  activeIcps: ActiveIcp[],
): Promise<ContactScoreBatchResult> {
  // Persona vocabulary + its hash are per-run constants (editing an
  // ICP mid-run is picked up by the NEXT run via hash mismatch). The
  // memo shares resolutions ACROSS chunks: the same unknown title on
  // contacts in chunk 1 and chunk 5 costs one LLM round-trip, not two.
  const vocab = personaVocabulary(activeIcps);
  const persona = { vocab, hash: vocabHash(vocab), memo: new Map<string, string[]>() };

  let scored = 0;
  for (let i = 0; i < contactIds.length; i += CONTACT_SCORE_BATCH_SIZE) {
    const r = await scoreContactIcpChunk(
      tenantId,
      contactIds.slice(i, i + CONTACT_SCORE_BATCH_SIZE),
      activeIcps,
      persona,
    );
    scored += r.scored;
  }
  return { scored };
}

async function scoreContactIcpChunk(
  tenantId: string,
  contactIds: string[],
  activeIcps: ActiveIcp[],
  persona: { vocab: string[]; hash: string; memo: Map<string, string[]> },
): Promise<ContactScoreBatchResult> {
  if (contactIds.length === 0 || activeIcps.length === 0) return { scored: 0 };

  const rows = await db
    .select({
      id: contacts.id,
      title: contacts.title,
      properties: contacts.properties,
      companyId: contacts.companyId,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        inArray(contacts.id, contactIds),
        isNull(contacts.deletedAt),
      ),
    );
  if (rows.length === 0) return { scored: 0 };

  const companyIds = [
    ...new Set(rows.map((r) => r.companyId).filter((v): v is string => !!v)),
  ];
  const companyRows = companyIds.length
    ? await db
        .select({
          id: companies.id,
          industry: companies.industry,
          size: companies.size,
          revenue: companies.revenue,
          properties: companies.properties,
        })
        .from(companies)
        .where(
          and(
            eq(companies.tenantId, tenantId),
            inArray(companies.id, companyIds),
            isNull(companies.deletedAt),
          ),
        )
    : [];
  const companyById = new Map(companyRows.map((c) => [c.id, c]));
  // Custom_property defs (e.g. institution flag) so company custom criteria
  // evaluate for the contact's company too.
  const customFields = await loadCustomFieldDefs(tenantId);

  const anySeniorityCriteria = activeIcps.some((icp) =>
    icp.criteria.some((c) => c.fieldKey === "person_seniorities"),
  );
  const titlesEnabled = persona.vocab.length > 0;
  const icpNameById = new Map(activeIcps.map((i) => [i.id, i.name]));
  const now = new Date().toISOString();

  // ── Title → persona resolution: cache, then literal fast-path, then
  // one batched LLM call for what's left. A contact ABSENT from
  // personasByContact (while titled) is UNRESOLVED — its title is not
  // evaluated this run (no penalty). `[]` is a true evaluated
  // non-match. Fresh resolutions write through to the contact's
  // properties cache in the same UPDATE that persists the score.
  const personasByContact = new Map<string, string[]>();
  const freshResolution = new Set<string>();
  if (titlesEnabled) {
    const vocabNorm = new Set(persona.vocab.map(norm));
    const needLlm = new Map<string, string>(); // norm(title) → title
    for (const row of rows) {
      const title = row.title?.trim();
      if (!title) continue;
      const key = norm(title);
      const cached = readCachedPersonas(
        row.properties as Record<string, unknown> | null,
        persona.hash,
      );
      if (cached !== null) {
        personasByContact.set(row.id, cached);
        continue;
      }
      const memoHit = persona.memo.get(key);
      if (memoHit) {
        // Resolved for an earlier chunk this run — reuse, write through.
        personasByContact.set(row.id, memoHit);
        freshResolution.add(row.id);
        continue;
      }
      if (vocabNorm.has(key)) {
        // The title IS one of the persona labels — no LLM needed.
        personasByContact.set(row.id, [title]);
        freshResolution.add(row.id);
        persona.memo.set(key, [title]);
        continue;
      }
      needLlm.set(key, title);
    }
    if (needLlm.size > 0) {
      const resolved = await resolveTitles(
        [...needLlm.values()],
        persona.vocab,
        tenantId,
      );
      for (const [k, v] of resolved) persona.memo.set(k, v);
      for (const row of rows) {
        if (personasByContact.has(row.id)) continue;
        const title = row.title?.trim();
        if (!title) continue;
        const r = resolved.get(norm(title));
        if (r) {
          personasByContact.set(row.id, r);
          freshResolution.add(row.id);
        }
      }
    }
  }

  const updates: Array<{
    id: string;
    score: number;
    reasons: string[];
    props: Record<string, unknown>;
  }> = [];

  for (const contact of rows) {
    const company = contact.companyId ? companyById.get(contact.companyId) : undefined;
    const companyCtx = company
      ? buildCompanyContext(
          {
            industry: company.industry,
            size: company.size,
            revenue: company.revenue,
            properties: company.properties as Record<string, unknown> | null,
          },
          customExtra(company.properties as Record<string, unknown> | null, customFields),
        )
      : {};
    const ctx = buildContactContext(companyCtx, {
      properties: contact.properties as Record<string, unknown> | null,
    });
    const title = contact.title?.trim();
    const personas = personasByContact.get(contact.id);
    if (title && personas) {
      // Known resolution: the raw title plus its persona aliases — the
      // engine's `in` intersection then matches whichever the
      // criterion lists. [] injects [title] alone: evaluated, and a
      // true non-match when the title isn't a vocabulary member.
      ctx.person_titles = [...new Set([title, ...personas])];
    }

    const cells: IcpFitCell[] = [];
    const cellMeta: Array<{ icpId: string; name: string; fit: number; coverage: number }> = [];
    for (const icp of activeIcps) {
      const fit = computeBlendedFit(icp.criteria, ctx, CONTACT_SOURCING_ONLY);
      cells.push({ icpId: icp.id, priority: icp.priority, fitScore: fit.score01 });
      cellMeta.push({
        icpId: icp.id,
        name: icp.name,
        fit: Math.round(fit.score01 * 1000) / 1000,
        coverage: Math.round(fit.coverage * 100) / 100,
      });
    }

    const primary = resolvePrimaryIcp(cells, PRIMARY_FIT_THRESHOLD);
    const score = primary ? Math.round(100 * primary.fitScore) : 0;
    const { grade } = getGrade(score);

    const reasons: string[] = [];
    if (primary) {
      reasons.push(`ICP fit: ${icpNameById.get(primary.icpId) ?? "profile"} (${score}/100)`);
    } else {
      reasons.push(
        `No ICP profile fits at ${Math.round(PRIMARY_FIT_THRESHOLD * 100)}% or more`,
      );
    }
    if (!company) {
      reasons.push("No company linked — company criteria can't be verified");
    }
    if (anySeniorityCriteria && ctx.person_seniorities === undefined) {
      reasons.push("Seniority unknown — seniority criteria not evaluated");
    }
    if (titlesEnabled && !title) {
      reasons.push("No title — title criteria not evaluated");
    }
    if (titlesEnabled && title && !personas) {
      reasons.push("Title not yet matched to personas — title criteria not evaluated");
    }
    if (titlesEnabled && title && personas && personas.length === 0) {
      reasons.push("Title outside the target personas");
    }

    updates.push({
      id: contact.id,
      score,
      reasons,
      props: {
        icp_fit: { primaryIcpId: primary?.icpId ?? null, cells: cellMeta, scoredAt: now },
        // `personas` is always set when the id is in freshResolution —
        // the second conjunct only narrows the type. Cached hits are
        // deliberately NOT rewritten (the jsonb merge would be a no-op).
        ...(freshResolution.has(contact.id) && personas
          ? { title_personas: { h: persona.hash, p: personas } }
          : {}),
        score_grade: grade,
        scored_at: now,
        scoring_method: "icp_fit",
      },
    });
  }

  // One statement for the whole batch (see fit-recompute-core for the
  // jsonb_build/recordset pattern and why per-row UPDATEs are banned).
  await db.execute(sql`
    UPDATE contacts AS c SET
      score = v.score::real,
      score_reasons = v.reasons,
      properties = COALESCE(c.properties, '{}'::jsonb) || v.props,
      updated_at = now()
    FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb)
      AS v(id text, score int, reasons jsonb, props jsonb)
    WHERE c.id = v.id AND c.tenant_id = ${tenantId} AND c.deleted_at IS NULL
  `);

  return { scored: updates.length };
}

/** Stable id list for batch slicing (mirrors listCompanyIds). */
export async function listContactIds(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)))
    .orderBy(contacts.id);
  return rows.map((r) => r.id);
}

/**
 * Tenant-wide run — pure SQL batches, fast enough to stay synchronous
 * (no Inngest/poll like the company recompute, which carries the
 * N×M fit-matrix history).
 */
export async function scoreAllContactsIcp(
  tenantId: string,
  activeIcps: ActiveIcp[],
): Promise<{ scored: number; total: number }> {
  const ids = await listContactIds(tenantId);
  const { scored } = await scoreContactIcpBatch(tenantId, ids, activeIcps);
  return { scored, total: ids.length };
}
