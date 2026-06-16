/**
 * Shadow propensity recompute (_specs/propensity-scoring B2/B3 wiring).
 *
 * Computes a propensity score ALONGSIDE the fit grade and stores it under
 * contacts.properties.propensity — WITHOUT touching contacts.score (the grade
 * stays fit-based). This lets us compare propensity vs fit on real outcomes (the
 * calibration report) and only flip the grade once propensity is proven better.
 *
 * Reuses the tested pure cores: computeDepth (graded firmographic depth),
 * scoreSignals → best fresh signal multiplier (intent), reach/value, and
 * assembleContactPropensity. Fit stays the GATE — a contact with no primary ICP
 * is out of ICP and gets no propensity. Runs as a second pass after the fit
 * scorer; never throws into the caller (best-effort).
 *
 * NOTE: not runtime-verified here (no DB). tsc-clean; smoke before relying on it.
 */
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  computeBlendedFit,
  computeDepth,
  resolvePrimaryIcp,
  type CompanyContext,
} from "@/lib/icp/criteria-engine";
import { buildCompanyContext } from "@/lib/icp/company-context";
import {
  buildContactContext,
  CONTACT_SOURCING_ONLY,
  CONTACT_SCORE_BATCH_SIZE,
} from "@/lib/scoring/contact-icp-fit";
import { type ActiveIcp } from "@/lib/icp/fit-recompute-core";
import { getSignalMultipliers } from "@/lib/scoring/signal-outcomes";
import { scoreSignals } from "@/lib/scoring/score-with-signals";
import { assembleContactPropensity } from "@/lib/scoring/contact-propensity";

export async function recomputeContactPropensity(
  tenantId: string,
  contactIds: string[],
  activeIcps: ActiveIcp[],
): Promise<{ updated: number }> {
  if (contactIds.length === 0 || activeIcps.length === 0) return { updated: 0 };
  const { multipliers } = await getSignalMultipliers(tenantId);
  const now = new Date();
  let updated = 0;
  for (let i = 0; i < contactIds.length; i += CONTACT_SCORE_BATCH_SIZE) {
    updated += await recomputeChunk(
      tenantId,
      contactIds.slice(i, i + CONTACT_SCORE_BATCH_SIZE),
      activeIcps,
      multipliers,
      now,
    );
  }
  return { updated };
}

async function recomputeChunk(
  tenantId: string,
  contactIds: string[],
  activeIcps: ActiveIcp[],
  multipliers: Record<string, number>,
  now: Date,
): Promise<number> {
  const rows = await db
    .select({
      id: contacts.id,
      properties: contacts.properties,
      companyId: contacts.companyId,
      phone: contacts.phone,
      email: contacts.email,
      linkedinUrl: contacts.linkedinUrl,
    })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, contactIds), isNull(contacts.deletedAt)));
  if (rows.length === 0) return 0;

  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((v): v is string => !!v))];
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
        .where(and(eq(companies.tenantId, tenantId), inArray(companies.id, companyIds), isNull(companies.deletedAt)))
    : [];
  const companyById = new Map(companyRows.map((c) => [c.id, c]));

  const updates: Array<{ id: string; props: Record<string, unknown> }> = [];

  for (const contact of rows) {
    const company = contact.companyId ? companyById.get(contact.companyId) : undefined;
    const companyCtx: CompanyContext = company
      ? buildCompanyContext({
          industry: company.industry,
          size: company.size,
          revenue: company.revenue,
          properties: company.properties as Record<string, unknown> | null,
        })
      : {};
    const cprops = contact.properties as { icp_fit?: { primaryIcpId?: string | null }; network?: unknown } | null;
    const ctx = buildContactContext(companyCtx, { properties: contact.properties as Record<string, unknown> | null });

    // Fit is the GATE: resolve the primary ICP (stored, else re-resolve).
    let primary = activeIcps.find((i) => i.id === (cprops?.icp_fit?.primaryIcpId ?? null));
    if (!primary) {
      const cells = activeIcps.map((i) => ({
        icpId: i.id,
        priority: i.priority,
        fitScore: computeBlendedFit(i.criteria, ctx, CONTACT_SOURCING_ONLY).score01,
      }));
      const r = resolvePrimaryIcp(cells);
      primary = r ? activeIcps.find((i) => i.id === r.icpId) : undefined;
    }
    if (!primary) continue; // out of ICP → no propensity

    const depth = computeDepth(primary.criteria, ctx, CONTACT_SOURCING_ONLY).depth01;
    const companyProps = (company?.properties as Record<string, unknown> | null) ?? {};
    const sb = scoreSignals(companyProps, multipliers, now);
    const bestMult = sb.contributions.length > 0 ? Math.max(1, ...sb.contributions.map((c) => c.multiplier)) : 1;

    const { components, propensity } = assembleContactPropensity({
      depth,
      signalMultiplier: bestMult,
      reach: {
        hasPhone: !!contact.phone,
        hasEmail: !!contact.email,
        hasLinkedin: !!contact.linkedinUrl,
        inNetwork: cprops?.network === true,
      },
      value: {
        employeeCount: typeof companyCtx.employee_count === "number" ? companyCtx.employee_count : null,
        revenue: typeof companyCtx.revenue === "number" ? companyCtx.revenue : null,
      },
    });

    updates.push({
      id: contact.id,
      props: {
        propensity: {
          score: Math.round(propensity * 1000) / 1000,
          components,
          computedAt: now.toISOString(),
        },
      },
    });
  }

  if (updates.length === 0) return 0;
  await db.execute(sql`
    UPDATE contacts AS c SET
      properties = COALESCE(c.properties, '{}'::jsonb) || v.props,
      updated_at = now()
    FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS v(id text, props jsonb)
    WHERE c.id = v.id AND c.tenant_id = ${tenantId} AND c.deleted_at IS NULL
  `);
  return updates.length;
}
