import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { enrichOrganization } from "@/lib/integrations/apollo-client";
import type { SkillRunOptions } from "@/skills/types";
import type { FundingSignalMonitorInput, FundingSignalMonitorOutput } from "./schema";

export async function fundingSignalMonitorHandler(
  input: FundingSignalMonitorInput,
  options: SkillRunOptions,
): Promise<FundingSignalMonitorOutput> {
  const signals: FundingSignalMonitorOutput["signals"] = [];

  const companyRecords = await db
    .select()
    .from(companies)
    .where(and(
      inArray(companies.id, input.companyIds),
      eq(companies.tenantId, options.tenantId),
    ));

  for (const company of companyRecords) {
    if (!company.domain) continue;

    const org = await enrichOrganization(company.domain).catch(() => null);
    if (!org) continue;

    const props = (company.properties as Record<string, unknown>) ?? {};
    const previousFunding = props.lastKnownTotalFunding as number | null;
    const previousStage = props.lastKnownFundingStage as string | null;

    const currentFunding = org.total_funding;
    const currentStage = org.latest_funding_stage;

    // Detect new funding
    const isNewFunding = !!(
      currentFunding &&
      currentFunding >= input.minFundingAmount &&
      (
        !previousFunding ||
        currentFunding > previousFunding * 1.1 || // 10%+ increase
        (currentStage && previousStage && currentStage !== previousStage)
      )
    );

    const isTargetStage = currentStage
      ? input.targetFundingStages.some((s) => currentStage.toLowerCase().includes(s.toLowerCase()))
      : false;

    if (currentFunding && currentFunding >= input.minFundingAmount) {
      let signalStrength: "high" | "medium" | "low";
      let recommendation: string;

      if (isNewFunding && isTargetStage) {
        signalStrength = "high";
        recommendation = `New ${currentStage} funding detected ($${(currentFunding / 1_000_000).toFixed(1)}M total). Reach out within 1 week — companies actively invest in tools post-funding.`;
      } else if (isNewFunding) {
        signalStrength = "medium";
        recommendation = `Funding increase detected (${previousFunding ? `$${(previousFunding / 1_000_000).toFixed(1)}M → ` : ""}$${(currentFunding / 1_000_000).toFixed(1)}M). Good time to re-engage.`;
      } else if (isTargetStage) {
        signalStrength = "medium";
        recommendation = `${currentStage} company with $${(currentFunding / 1_000_000).toFixed(1)}M total funding. Well-funded target.`;
      } else {
        signalStrength = "low";
        recommendation = `Funded company ($${(currentFunding / 1_000_000).toFixed(1)}M) — monitor for future rounds.`;
      }

      signals.push({
        companyId: company.id,
        companyName: company.name,
        companyDomain: company.domain,
        fundingStage: currentStage,
        totalFunding: currentFunding,
        totalFundingPrinted: org.total_funding_printed,
        isNewFunding,
        signalStrength,
        recommendation,
      });

      // Update stored funding for future diff
      await db.update(companies).set({
        properties: {
          ...props,
          lastKnownTotalFunding: currentFunding,
          lastKnownFundingStage: currentStage,
          fundingLastCheckedAt: new Date().toISOString(),
        },
      }).where(eq(companies.id, company.id));
    }
  }

  const strengthOrder = { high: 0, medium: 1, low: 2 };
  signals.sort((a, b) => strengthOrder[a.signalStrength] - strengthOrder[b.signalStrength]);

  return {
    totalChecked: companyRecords.length,
    fundedCompanies: signals.length,
    newFundingDetected: signals.filter((s) => s.isNewFunding).length,
    signals,
  };
}
