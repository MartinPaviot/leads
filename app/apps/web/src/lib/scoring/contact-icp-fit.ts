/**
 * Contact × ICP fit — score contacts against the tenant's ICP profiles
 * by REUSING the company criteria engine (computeBlendedFit) over a
 * merged context: the contact's company context (industry, size, geo,
 * revenue, …) plus the person dimension.
 *
 * Person fields:
 *   - person_seniorities IS scorable here: both the criterion values
 *     and the contact's enriched `properties.seniority` are Apollo
 *     enums (c_suite, vp, director, …) the engine's norm() already
 *     equates across separators/casing.
 *   - person_titles / hiring_job_titles stay sourcing-only: their
 *     values are persona labels ("CEO", "Head of Sales") that a
 *     literal compare cannot honestly match against real-world titles
 *     ("Directeur Général adjoint") — scoring them literally would
 *     zero every non-English contact. Title→persona resolution is an
 *     LLM-mapping feature (the matchIndustries pattern), not a string
 *     compare; until it ships, titles keep gating sourcing only.
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
  type IcpFitCell,
} from "@/lib/icp/criteria-engine";
import { SOURCING_ONLY_FIELD_KEYS } from "@/lib/icp/field-catalog";
import { buildCompanyContext, type CompanyContext } from "@/lib/icp/company-context";
import { PRIMARY_FIT_THRESHOLD, type ActiveIcp } from "@/lib/icp/fit-recompute-core";
import { getGrade } from "@/lib/scoring/scoring";

export const CONTACT_SCORE_BATCH_SIZE = 100;

/** Person fields the CONTACT engine evaluates (the company engine
 *  excludes all of SOURCING_ONLY_FIELD_KEYS). */
export const CONTACT_SCORABLE_PERSON_FIELDS: ReadonlySet<string> = new Set([
  "person_seniorities",
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
  let scored = 0;
  for (let i = 0; i < contactIds.length; i += CONTACT_SCORE_BATCH_SIZE) {
    const r = await scoreContactIcpChunk(
      tenantId,
      contactIds.slice(i, i + CONTACT_SCORE_BATCH_SIZE),
      activeIcps,
    );
    scored += r.scored;
  }
  return { scored };
}

async function scoreContactIcpChunk(
  tenantId: string,
  contactIds: string[],
  activeIcps: ActiveIcp[],
): Promise<ContactScoreBatchResult> {
  if (contactIds.length === 0 || activeIcps.length === 0) return { scored: 0 };

  const rows = await db
    .select({
      id: contacts.id,
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

  const anyPersonCriteria = activeIcps.some((icp) =>
    icp.criteria.some((c) => CONTACT_SCORABLE_PERSON_FIELDS.has(c.fieldKey)),
  );
  const icpNameById = new Map(activeIcps.map((i) => [i.id, i.name]));
  const now = new Date().toISOString();

  const updates: Array<{
    id: string;
    score: number;
    reasons: string[];
    props: Record<string, unknown>;
  }> = [];

  for (const contact of rows) {
    const company = contact.companyId ? companyById.get(contact.companyId) : undefined;
    const companyCtx = company
      ? buildCompanyContext({
          industry: company.industry,
          size: company.size,
          revenue: company.revenue,
          properties: company.properties as Record<string, unknown> | null,
        })
      : {};
    const ctx = buildContactContext(companyCtx, {
      properties: contact.properties as Record<string, unknown> | null,
    });

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
    if (anyPersonCriteria && ctx.person_seniorities === undefined) {
      reasons.push("Seniority unknown — person criteria not evaluated");
    }

    updates.push({
      id: contact.id,
      score,
      reasons,
      props: {
        icp_fit: { primaryIcpId: primary?.icpId ?? null, cells: cellMeta, scoredAt: now },
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
