/**
 * Per-company enrichment orchestrator — the single honest unit of work
 * shared by the JSON route (`/api/enrich`) and the streaming route
 * (`/api/enrich/stream`).
 *
 * It runs the waterfall scoped to a chosen set of criteria, persists
 * only those fields, and returns a precise per-criterion outcome
 * (`filled` / `already-present` / `not-found`) so neither caller has to
 * guess whether anything actually changed.
 */

import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { embedEntity, companyToText } from "@/lib/ai/embeddings";
import { employeeCountToRange, revenueToRange } from "@/lib/integrations/apollo-client";
import { enrichCompany } from "@/lib/providers/company-enrichment";
import type {
  EnrichedCompany,
  ProvenanceEntry,
  WaterfallResult,
} from "@/lib/providers/company-enrichment";
import {
  criterionPresent,
  evaluateCriterion,
  fieldsForCriteria,
  hasEnrichmentValue,
  type CriterionKey,
  type CriterionOutcome,
  type EnrichmentCriterion,
} from "@/lib/providers/company-enrichment/criteria";

/** Company row shape the orchestrator reads (subset of the table). */
export type CompanyRow = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  description: string | null;
  size: string | null;
  revenue: string | null;
  properties: Record<string, unknown> | null;
};

export interface EnrichCriterionResult {
  key: string;
  label: string;
  outcome: CriterionOutcome;
  value: string | null;
}

export type EnrichCompanyStatus = "enriched" | "already-complete" | "no-data" | "error";

export interface EnrichCompanyOutcome {
  status: EnrichCompanyStatus;
  provider: string | null;
  costCents: number;
  criteria: EnrichCriterionResult[];
}

/** Per-company result as returned by the JSON route (outcome + identity). */
export interface EnrichCompanyResult extends EnrichCompanyOutcome {
  id: string;
  ok: boolean;
}

/** Load a single tenant-scoped, non-deleted company row. */
export async function loadCompanyRow(id: string, tenantId: string): Promise<CompanyRow | null> {
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)))
    .limit(1);
  return (company as CompanyRow) ?? null;
}

/**
 * Project a persisted company row into the normalized `EnrichedCompany`
 * shape, reading forensic fields back out of `properties` using the same
 * keys `persistEnrichment` writes. This is the "before" picture each
 * criterion's outcome is computed against.
 */
export function companyToEnrichedView(company: CompanyRow): Partial<EnrichedCompany> {
  const p = (company.properties ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : []);
  return {
    domain: company.domain ?? null,
    name: company.name ?? null,
    industry: company.industry ?? null,
    description: company.description ?? null,
    sizeRange: company.size ?? null,
    employeeCount: num(p.employee_count),
    revenueRange: company.revenue ?? null,
    annualRevenue: num(p.annual_revenue),
    foundedYear: num(p.founded_year),
    city: str(p.city),
    state: str(p.state),
    country: str(p.country),
    technologies: arr(p.technologies),
    keywords: arr(p.keywords),
    fundingStage: str(p.latest_funding_stage),
    totalFunding: num(p.total_funding),
    investors: arr(p.investors),
    linkedinUrl: str(p.linkedin_url) ?? str(p.linkedinUrl),
  };
}

/** First non-empty value among a criterion's fields, as a compact string. */
export function criterionValue(
  criterion: EnrichmentCriterion,
  source: Partial<EnrichedCompany> | null | undefined,
): string | null {
  if (!source) return null;
  for (const f of criterion.fields) {
    const v = source[f];
    if (!hasEnrichmentValue(v)) continue;
    if (Array.isArray(v)) return v.slice(0, 5).join(", ");
    if (typeof v === "number") return String(v);
    return String(v);
  }
  return null;
}

/**
 * Persist a waterfall result onto the row, scoped to `allowedFields`.
 * Only fields belonging to the requested criteria are written — so
 * "enrich revenue" never silently rewrites industry. Existing values
 * are never nulled.
 */
async function persistEnrichment(params: {
  tenantId: string;
  companyId: string;
  existingProps: Record<string, unknown>;
  existing: { industry: string | null; description: string | null; size: string | null; revenue: string | null };
  waterfall: WaterfallResult;
  allowedFields: Set<keyof EnrichedCompany>;
}): Promise<void> {
  const { tenantId, companyId, existingProps, existing, waterfall, allowedFields } = params;
  const { data, provenance, totalCostCents, attempts, enriched } = waterfall;
  const allow = (f: keyof EnrichedCompany) => allowedFields.has(f);

  const primaryProvider = provenance[0]?.provider ?? null;
  const priorCost = typeof existingProps.enrichmentCostCents === "number"
    ? (existingProps.enrichmentCostCents as number)
    : 0;

  const priorProvenanceHistory = Array.isArray(existingProps.enrichmentProvenanceHistory)
    ? (existingProps.enrichmentProvenanceHistory as ProvenanceEntry[][])
    : [];
  const nextProvenanceHistory = Array.isArray(existingProps.enrichmentProvenance) && (existingProps.enrichmentProvenance as ProvenanceEntry[]).length > 0
    ? [...priorProvenanceHistory, existingProps.enrichmentProvenance as ProvenanceEntry[]]
    : priorProvenanceHistory;

  const merged: Record<string, unknown> = {
    ...existingProps,
    enrichment_source: primaryProvider ?? existingProps.enrichment_source ?? "unavailable",
    enrichmentProvenance: provenance,
    enrichmentProvenanceHistory: nextProvenanceHistory.slice(-5),
    enrichmentCostCents: priorCost + totalCostCents,
    enrichmentLastRun: new Date().toISOString(),
    enrichmentAttemptSummary: attempts.map((a) => ({
      provider: a.provider,
      ok: a.ok,
      error: a.error ?? null,
      durationMs: a.durationMs,
      costCents: a.costCents,
    })),
    ...(allow("linkedinUrl") && data.linkedinUrl ? { linkedin_url: data.linkedinUrl } : {}),
    ...(allow("foundedYear") && data.foundedYear ? { founded_year: data.foundedYear } : {}),
    ...(allow("technologies") && data.technologies.length > 0 ? { technologies: data.technologies } : {}),
    ...(allow("keywords") && data.keywords.length > 0 ? { keywords: data.keywords } : {}),
    ...(allow("totalFunding") && data.totalFunding != null ? { total_funding: data.totalFunding } : {}),
    ...(allow("fundingStage") && data.fundingStage ? { latest_funding_stage: data.fundingStage } : {}),
    ...(allow("investors") && data.investors.length > 0 ? { investors: data.investors } : {}),
    ...(allow("employeeCount") && data.employeeCount != null ? { employee_count: data.employeeCount } : {}),
    ...(allow("annualRevenue") && data.annualRevenue != null ? { annual_revenue: data.annualRevenue } : {}),
    ...(allow("revenueRange") && data.revenueRange ? { annual_revenue_printed: data.revenueRange } : {}),
    ...(allow("city") && data.city ? { city: data.city } : {}),
    ...(allow("state") && data.state ? { state: data.state } : {}),
    ...(allow("country") && data.country ? { country: data.country } : {}),
    ...(enriched ? {} : {
      enrichment_error: attempts.length === 0
        ? "No enrichment providers available"
        : attempts.every((a) => !a.ok)
          ? "All providers failed"
          : "Providers returned empty data",
    }),
  };

  const wantSize = allow("employeeCount") || allow("sizeRange");
  const wantRevenue = allow("annualRevenue") || allow("revenueRange");
  const size = wantSize
    ? (data.sizeRange ?? employeeCountToRange(data.employeeCount) ?? existing.size)
    : existing.size;
  const revenue = wantRevenue
    ? (data.revenueRange ?? revenueToRange(data.annualRevenue) ?? existing.revenue)
    : existing.revenue;

  await db
    .update(companies)
    .set({
      industry: allow("industry") ? (data.industry ?? existing.industry) : existing.industry,
      description: allow("description") ? (data.description ?? existing.description) : existing.description,
      size,
      revenue,
      properties: merged,
      lastEnrichedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(companies.id, companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)));
}

/**
 * Enrich one already-loaded company row for the requested criteria.
 *
 * `onSearching` (optional) is invoked with the gap criteria right before
 * the provider call — the streaming route uses it to flip those cells to
 * a "searching…" shimmer. The JSON route omits it.
 */
export async function enrichOneCompany(params: {
  company: CompanyRow;
  requestedCriteria: EnrichmentCriterion[];
  tenantId: string;
  onSearching?: (criterionKeys: CriterionKey[]) => void;
}): Promise<EnrichCompanyOutcome> {
  const { company, requestedCriteria, tenantId, onSearching } = params;
  const allowedFields = fieldsForCriteria(requestedCriteria);
  const before = companyToEnrichedView(company);

  // Already-complete short-circuit: nothing requested is missing, so we
  // don't pay for a provider call.
  if (requestedCriteria.every((c) => criterionPresent(c, before))) {
    return {
      status: "already-complete",
      provider: (company.properties?.enrichment_source as string) ?? null,
      costCents: 0,
      criteria: requestedCriteria.map((c) => ({
        key: c.key,
        label: c.label,
        outcome: "already-present" as const,
        value: criterionValue(c, before),
      })),
    };
  }

  if (onSearching) {
    const gaps = requestedCriteria.filter((c) => !criterionPresent(c, before)).map((c) => c.key);
    if (gaps.length > 0) onSearching(gaps);
  }

  const waterfall = await enrichCompany(
    { domain: company.domain ?? undefined, name: company.name },
    { tenantId },
  );

  await persistEnrichment({
    tenantId,
    companyId: company.id,
    existingProps: (company.properties || {}) as Record<string, unknown>,
    existing: { industry: company.industry, description: company.description, size: company.size, revenue: company.revenue },
    waterfall,
    allowedFields,
  });

  const criteria: EnrichCriterionResult[] = requestedCriteria.map((c) => {
    const outcome = evaluateCriterion(c, before, waterfall.data);
    const value =
      outcome === "filled"
        ? criterionValue(c, waterfall.data)
        : outcome === "already-present"
          ? criterionValue(c, before)
          : null;
    return { key: c.key, label: c.label, outcome, value };
  });

  const anyFilled = criteria.some((c) => c.outcome === "filled");
  const anyNotFound = criteria.some((c) => c.outcome === "not-found");
  const status: EnrichCompanyStatus = anyFilled ? "enriched" : anyNotFound ? "no-data" : "already-complete";

  const touchesEmbedding =
    allowedFields.has("industry") ||
    allowedFields.has("description") ||
    allowedFields.has("employeeCount") ||
    allowedFields.has("sizeRange");
  if (anyFilled && touchesEmbedding && process.env.OPENAI_API_KEY) {
    const text = companyToText({
      name: company.name,
      domain: company.domain,
      industry: waterfall.data.industry ?? company.industry,
      revenue: waterfall.data.revenueRange ?? revenueToRange(waterfall.data.annualRevenue) ?? company.revenue,
      size: waterfall.data.sizeRange ?? employeeCountToRange(waterfall.data.employeeCount) ?? company.size,
      description: waterfall.data.description ?? company.description,
    });
    if (text) {
      await embedEntity(tenantId, "company", company.id, text).catch((err) =>
        console.warn("enrich: re-embed failed", err),
      );
    }
  }

  return {
    status,
    provider: waterfall.provenance[0]?.provider ?? null,
    costCents: waterfall.totalCostCents,
    criteria,
  };
}
