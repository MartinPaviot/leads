import { db } from "@/db";
import { companies, activities, deals, contacts } from "@/db/schema";
import { eq, and, inArray, gte, sql, desc } from "drizzle-orm";
import { getMomentum } from "@/lib/analytics/momentum";
import type { SkillRunOptions } from "@/skills/types";
import type { SignalScannerInput, SignalScannerOutput } from "./schema";

type Signal = SignalScannerOutput["signals"][number];

export async function signalScannerHandler(
  input: SignalScannerInput,
  options: SkillRunOptions,
): Promise<SignalScannerOutput> {
  const signals: Signal[] = [];
  const lookbackDate = new Date(Date.now() - input.lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch companies
  const companyRecords = await db
    .select()
    .from(companies)
    .where(and(
      inArray(companies.id, input.companyIds),
      eq(companies.tenantId, options.tenantId),
    ));

  const companyMap = new Map(companyRecords.map((c) => [c.id, c]));

  for (const company of companyRecords) {
    const props = (company.properties as Record<string, unknown>) ?? {};

    // Funding signal — check company properties
    if (input.signalTypes.includes("funding")) {
      const fundingStage = props.fundingStage as string | null;
      const totalFunding = props.totalFunding as number | null;
      if (fundingStage && totalFunding && totalFunding > 0) {
        signals.push({
          companyId: company.id,
          companyName: company.name,
          signalType: "funding",
          title: `${fundingStage} funding detected`,
          description: `${company.name} has ${fundingStage} funding totaling $${(totalFunding / 1_000_000).toFixed(1)}M`,
          strength: totalFunding > 10_000_000 ? "high" : totalFunding > 1_000_000 ? "medium" : "low",
          detectedAt: new Date().toISOString(),
          dataSource: "apollo_enrichment",
          // MONACO-PARITY-01: rule-based signal from Apollo data —
          // no URL citation, but the rule is deterministic so we
          // tag confidence high. The classifier will surface this
          // as "likely" in the 4-state UI badge (urlOutcome=null +
          // confidence ≥ 0.7 → likely).
          sourceUrl: null,
          confidence: 0.95,
          verificationStatus: null,
        });
      }
    }

    // Engagement spike — compare recent vs older activity
    if (input.signalTypes.includes("engagement_spike")) {
      const midpoint = new Date(Date.now() - (input.lookbackDays / 2) * 24 * 60 * 60 * 1000);

      const [recentCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(activities)
        .where(and(
          eq(activities.tenantId, options.tenantId),
          eq(activities.entityId, company.id),
          eq(activities.entityType, "company"),
          gte(activities.occurredAt, midpoint),
        ));

      const [olderCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(activities)
        .where(and(
          eq(activities.tenantId, options.tenantId),
          eq(activities.entityId, company.id),
          eq(activities.entityType, "company"),
          gte(activities.occurredAt, lookbackDate),
          sql`${activities.occurredAt} < ${midpoint.toISOString()}::timestamptz`,
        ));

      const recent = Number(recentCount?.count || 0);
      const older = Number(olderCount?.count || 0);

      if (recent > 0 && older > 0 && recent >= older * 2) {
        signals.push({
          companyId: company.id,
          companyName: company.name,
          signalType: "engagement_spike",
          title: "Engagement spike detected",
          description: `Activity increased ${Math.round(recent / older)}x: ${recent} interactions in last ${Math.round(input.lookbackDays / 2)} days vs ${older} before`,
          strength: recent >= older * 3 ? "high" : "medium",
          detectedAt: new Date().toISOString(),
          dataSource: "activity_history",
          // MONACO-PARITY-01: derived from local activity table —
          // deterministic count, high confidence, no URL citation.
          sourceUrl: null,
          confidence: 0.9,
          verificationStatus: null,
        });
      }
    }

    // Deal stall — find deals stuck in stage
    if (input.signalTypes.includes("deal_stall")) {
      const companyDeals = await db
        .select()
        .from(deals)
        .where(and(
          eq(deals.tenantId, options.tenantId),
          eq(deals.companyId, company.id),
          sql`${deals.stage} NOT IN ('won', 'lost')`,
        ));

      for (const deal of companyDeals) {
        const updatedAt = deal.updatedAt ? new Date(deal.updatedAt) : null;
        if (updatedAt) {
          const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate > 14) {
            signals.push({
              companyId: company.id,
              companyName: company.name,
              signalType: "deal_stall",
              title: `Deal "${deal.name}" stalled in ${deal.stage}`,
              description: `No update for ${Math.round(daysSinceUpdate)} days. Value: ${deal.value ? `$${deal.value}` : "unset"}`,
              strength: daysSinceUpdate > 30 ? "high" : "medium",
              detectedAt: new Date().toISOString(),
              dataSource: "deal_pipeline",
              // MONACO-PARITY-01: derived from local deal table —
              // deterministic threshold check, high confidence.
              sourceUrl: null,
              confidence: 0.9,
              verificationStatus: null,
            });
          }
        }
      }
    }

    // Tech adoption signal — check for new technologies
    if (input.signalTypes.includes("tech_adoption")) {
      const technologies = (props.technologies as string[]) ?? [];
      if (technologies.length > 5) {
        signals.push({
          companyId: company.id,
          companyName: company.name,
          signalType: "tech_adoption",
          title: "Rich tech stack detected",
          description: `${company.name} uses ${technologies.length} technologies: ${technologies.slice(0, 5).join(", ")}...`,
          strength: technologies.length > 15 ? "high" : "medium",
          detectedAt: new Date().toISOString(),
          dataSource: "apollo_enrichment",
          // MONACO-PARITY-01: Apollo-derived deterministic count.
          sourceUrl: null,
          confidence: 0.9,
          verificationStatus: null,
        });
      }
    }
  }

  // Sort by strength (high first)
  const strengthOrder = { high: 0, medium: 1, low: 2 };
  signals.sort((a, b) => strengthOrder[a.strength] - strengthOrder[b.strength]);

  const companiesWithSignals = new Set(signals.map((s) => s.companyId)).size;

  return {
    totalCompaniesScanned: companyRecords.length,
    totalSignalsDetected: signals.length,
    signals,
    companiesWithSignals,
  };
}
