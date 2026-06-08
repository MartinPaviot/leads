import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
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

/**
 * Persist a waterfall enrichment result onto the `companies` row. The
 * route used to hand-roll an Apollo → LLM fallback chain with copy-
 * pasted persistence blocks; that logic now lives inside the waterfall
 * and this function only deals with the write.
 *
 * Normalized fields map to first-class columns (industry, description,
 * size, revenue). Everything else — provenance, cost, raw provider
 * metadata — lives in the JSONB `properties` blob so analytics +
 * debugging don't need a schema migration every time we add a provider.
 */
async function persistEnrichment(params: {
  tenantId: string;
  companyId: string;
  existingProps: Record<string, unknown>;
  existing: { industry: string | null; description: string | null; size: string | null; revenue: string | null };
  waterfall: WaterfallResult;
}): Promise<void> {
  const { tenantId, companyId, existingProps, existing, waterfall } = params;
  const { data, provenance, totalCostCents, attempts, enriched } = waterfall;

  const primaryProvider = provenance[0]?.provider ?? null;
  const priorCost = typeof existingProps.enrichmentCostCents === "number"
    ? (existingProps.enrichmentCostCents as number)
    : 0;

  // Archive prior provenance so repeated enrichments preserve history.
  const priorProvenanceHistory = Array.isArray(existingProps.enrichmentProvenanceHistory)
    ? (existingProps.enrichmentProvenanceHistory as ProvenanceEntry[][])
    : [];
  const nextProvenanceHistory = Array.isArray(existingProps.enrichmentProvenance) && (existingProps.enrichmentProvenance as ProvenanceEntry[]).length > 0
    ? [...priorProvenanceHistory, existingProps.enrichmentProvenance as ProvenanceEntry[]]
    : priorProvenanceHistory;

  const merged: Record<string, unknown> = {
    ...existingProps,
    // Primary provider that contributed the first field. Back-compat
    // for callers still checking `properties.enrichment_source`.
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
    // Normalised forensic fields that some downstream consumers read.
    // We only set when the waterfall gave us a value so we never null
    // out data a prior run wrote.
    ...(data.linkedinUrl ? { linkedin_url: data.linkedinUrl } : {}),
    ...(data.foundedYear ? { founded_year: data.foundedYear } : {}),
    ...(data.technologies.length > 0 ? { technologies: data.technologies } : {}),
    ...(data.keywords.length > 0 ? { keywords: data.keywords } : {}),
    ...(data.totalFunding != null ? { total_funding: data.totalFunding } : {}),
    ...(data.fundingStage ? { latest_funding_stage: data.fundingStage } : {}),
    ...(data.employeeCount != null ? { employee_count: data.employeeCount } : {}),
    ...(data.annualRevenue != null ? { annual_revenue: data.annualRevenue } : {}),
    ...(data.revenueRange ? { annual_revenue_printed: data.revenueRange } : {}),
    ...(data.city ? { city: data.city } : {}),
    ...(data.state ? { state: data.state } : {}),
    ...(data.country ? { country: data.country } : {}),
    // If nothing came back, record the reason so we don't silently
    // retry forever.
    ...(enriched ? {} : {
      enrichment_error: attempts.length === 0
        ? "No enrichment providers available"
        : attempts.every((a) => !a.ok)
          ? "All providers failed"
          : "Providers returned empty data",
    }),
  };

  const size = data.sizeRange ?? employeeCountToRange(data.employeeCount) ?? existing.size;
  const revenue = data.revenueRange ?? revenueToRange(data.annualRevenue) ?? existing.revenue;

  await db
    .update(companies)
    .set({
      industry: data.industry ?? existing.industry,
      description: data.description ?? existing.description,
      size,
      revenue,
      properties: merged,
      lastEnrichedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(companies.id, companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)));
}

/**
 * POST /api/enrich — run the company-enrichment waterfall on up to 20
 * companies per request. Callers pass `companyIds`. Responses include
 * the per-company primary provider so a UI can surface "enriched via
 * Apollo" / "enriched via LLM fallback".
 *
 * Skips companies already enriched via Apollo (strongest source) when
 * both industry + description are present — callers can force a re-run
 * by clearing `properties.enrichment_source` in the CRM UI.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("enrich", authCtx.userId);
  if (rlResponse) return rlResponse;

  try {
    const body = await req.json();
    const { companyIds } = body;

    if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
      return Response.json({ error: "companyIds array required" }, { status: 400 });
    }

    let enrichedCount = 0;
    let failed = 0;
    const perCompany: Array<{ id: string; ok: boolean; provider: string | null; costCents: number }> = [];

    for (const id of companyIds.slice(0, 20)) {
      try {
        const [company] = await db
          .select()
          .from(companies)
          .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
          .limit(1);

        if (!company) {
          failed++;
          perCompany.push({ id, ok: false, provider: null, costCents: 0 });
          continue;
        }

        const props = (company.properties || {}) as Record<string, unknown>;
        // Short-circuit: already-enriched rows with high-quality data.
        // Apollo is our strongest source; once it's filled industry +
        // description we don't re-pay for an LLM call.
        if (props.enrichment_source === "apollo" && company.industry && company.description) {
          enrichedCount++;
          perCompany.push({ id, ok: true, provider: "apollo", costCents: 0 });
          continue;
        }

        const waterfall = await enrichCompany(
          {
            domain: company.domain ?? undefined,
            name: company.name,
          },
          { tenantId: authCtx.tenantId },
        );

        await persistEnrichment({
          tenantId: authCtx.tenantId,
          companyId: id,
          existingProps: props,
          existing: {
            industry: company.industry,
            description: company.description,
            size: company.size,
            revenue: company.revenue,
          },
          waterfall,
        });

        const primaryProvider = waterfall.provenance[0]?.provider ?? null;

        // Re-embed if we got new industry/description/size data so RAG
        // search reflects the latest enrichment.
        if (waterfall.enriched && process.env.OPENAI_API_KEY) {
          const text = companyToText({
            name: company.name,
            domain: company.domain,
            industry: waterfall.data.industry ?? company.industry,
            revenue: waterfall.data.revenueRange ?? revenueToRange(waterfall.data.annualRevenue) ?? company.revenue,
            size: waterfall.data.sizeRange ?? employeeCountToRange(waterfall.data.employeeCount) ?? company.size,
            description: waterfall.data.description ?? company.description,
          });
          if (text) {
            await embedEntity(authCtx.tenantId, "company", id, text).catch((err) =>
              console.warn("enrich: re-embed failed", err)
            );
          }
        }

        if (waterfall.enriched) {
          enrichedCount++;
          perCompany.push({
            id,
            ok: true,
            provider: primaryProvider,
            costCents: waterfall.totalCostCents,
          });
        } else {
          failed++;
          perCompany.push({
            id,
            ok: false,
            provider: null,
            costCents: waterfall.totalCostCents,
          });
        }
      } catch (err) {
        console.warn(`Failed to enrich company ${id}:`, err);
        failed++;
        perCompany.push({ id, ok: false, provider: null, costCents: 0 });
      }
    }

    return Response.json({ success: true, enriched: enrichedCount, failed, perCompany });
  } catch (error) {
    console.error("Enrichment failed:", error);
    return Response.json({ error: "Enrichment failed" }, { status: 500 });
  }
}
