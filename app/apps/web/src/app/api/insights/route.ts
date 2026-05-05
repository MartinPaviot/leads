import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals, contacts, companies, activities, sequences, sequenceEnrollments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

interface Insight {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "info";
  category: "alert" | "trend" | "pattern" | "opportunity";
  suggestedAction: string;
}

export async function GET() {
  return withAuthRLS(async (authCtx) => {
    try {
    const [allDeals, allContacts, allCompanies, allEnrollments] = await Promise.all([
      db.select().from(deals).where(eq(deals.tenantId, authCtx.tenantId)),
      db.select().from(contacts).where(eq(contacts.tenantId, authCtx.tenantId)),
      db.select().from(companies).where(eq(companies.tenantId, authCtx.tenantId)),
      db.select().from(sequenceEnrollments),
    ]);

    const insights: Insight[] = [];
    let insightId = 0;
    const nextId = () => `insight-${++insightId}`;

    const now = Date.now();
    const dayMs = 86400000;

    // === ALERTS ===

    // Stalling deals: deals in active stages with updatedAt > 14 days ago
    const activeStages = ["lead", "qualification", "demo", "trial", "proposal", "negotiation"];
    const stallingDeals = allDeals.filter(
      (d) =>
        activeStages.includes(d.stage!) &&
        d.updatedAt &&
        now - new Date(d.updatedAt).getTime() > 14 * dayMs
    );
    if (stallingDeals.length > 0) {
      // Sort by value descending so highest-value stalled deals appear first
      const sorted = [...stallingDeals].sort((a, b) => (b.value || 0) - (a.value || 0));
      const totalAtRisk = sorted.reduce((s, d) => s + (d.value || 0), 0);
      const topDeal = sorted[0];
      const topDealDays = topDeal.updatedAt ? Math.floor((now - new Date(topDeal.updatedAt).getTime()) / dayMs) : 14;

      const dealDetails = sorted.slice(0, 3).map((d) => {
        const days = d.updatedAt ? Math.floor((now - new Date(d.updatedAt).getTime()) / dayMs) : 14;
        return `${d.name}${d.value ? ` ($${d.value.toLocaleString()})` : ""} — ${days}d silent`;
      });

      insights.push({
        id: nextId(),
        title: `${stallingDeals.length} deal${stallingDeals.length > 1 ? "s" : ""} stalling${totalAtRisk > 0 ? ` — $${totalAtRisk.toLocaleString()} at risk` : ""}`,
        description: dealDetails.join(". ") + (stallingDeals.length > 3 ? `. +${stallingDeals.length - 3} more.` : "."),
        severity: stallingDeals.length >= 3 || totalAtRisk >= 50000 ? "critical" : "high",
        category: "alert",
        suggestedAction: topDeal.value
          ? `Priority: re-engage ${topDeal.name} ($${topDeal.value.toLocaleString()}, ${topDealDays}d silent) with a new angle.`
          : `Re-engage ${topDeal.name} (${topDealDays}d silent) — try a different approach or escalate to a champion.`,
      });
    }

    // High-risk deals
    const highRiskDeals = allDeals.filter(
      (d) =>
        activeStages.includes(d.stage!) &&
        (d.properties as Record<string, unknown>)?.riskLevel === "high"
    );
    if (highRiskDeals.length > 0) {
      const riskValue = highRiskDeals.reduce((s, d) => s + (d.value || 0), 0);
      const riskDetails = highRiskDeals.slice(0, 3).map((d) =>
        `${d.name}${d.value ? ` ($${d.value.toLocaleString()})` : ""} in ${d.stage}`
      );
      insights.push({
        id: nextId(),
        title: `${highRiskDeals.length} high-risk deal${highRiskDeals.length > 1 ? "s" : ""}${riskValue > 0 ? ` — $${riskValue.toLocaleString()} at stake` : ""}`,
        description: riskDetails.join(". ") + ".",
        severity: "high",
        category: "alert",
        suggestedAction: `Review ${highRiskDeals[0].name} first — identify the blocker and schedule a champion call.`,
      });
    }

    // Cold contacts: contacts with no recent activity
    const contactsWithoutCompany = allContacts.filter((c) => !c.companyId);
    if (contactsWithoutCompany.length >= 5) {
      insights.push({
        id: nextId(),
        title: `${contactsWithoutCompany.length} orphan contacts`,
        description: `Contacts without a linked company can't be enriched or scored properly.`,
        severity: "medium",
        category: "alert",
        suggestedAction: "Associate orphan contacts with companies via CSV re-import or manual edit.",
      });
    }

    // === TRENDS ===

    // Win rate trend
    const wonDeals = allDeals.filter((d) => d.stage === "won");
    const lostDeals = allDeals.filter((d) => d.stage === "lost");
    const closedCount = wonDeals.length + lostDeals.length;
    if (closedCount >= 3) {
      const winRate = Math.round((wonDeals.length / closedCount) * 100);
      if (winRate >= 50) {
        insights.push({
          id: nextId(),
          title: `Win rate at ${winRate}%`,
          description: `${wonDeals.length} won vs ${lostDeals.length} lost. Strong conversion.`,
          severity: "info",
          category: "trend",
          suggestedAction: "Analyze winning patterns to replicate across pipeline.",
        });
      } else {
        insights.push({
          id: nextId(),
          title: `Win rate at ${winRate}%`,
          description: `${wonDeals.length} won vs ${lostDeals.length} lost. Room for improvement.`,
          severity: winRate < 25 ? "high" : "medium",
          category: "trend",
          suggestedAction: "Review lost deals for common objections and refine your approach.",
        });
      }
    }

    // Pipeline concentration
    const stageDistribution = activeStages.map((stage) => ({
      stage,
      count: allDeals.filter((d) => d.stage === stage).length,
    }));
    const topStage = stageDistribution.reduce((a, b) => (b.count > a.count ? b : a), stageDistribution[0]);
    const activeCount = allDeals.filter((d) => activeStages.includes(d.stage!)).length;
    if (activeCount >= 5 && topStage.count > activeCount * 0.6) {
      insights.push({
        id: nextId(),
        title: `Pipeline bottleneck at ${topStage.stage}`,
        description: `${Math.round((topStage.count / activeCount) * 100)}% of active deals stuck in ${topStage.stage} stage.`,
        severity: "medium",
        category: "pattern",
        suggestedAction: `Focus on moving ${topStage.stage} deals forward — review what's blocking progression.`,
      });
    }

    // === OPPORTUNITIES ===

    // High-scored accounts without sequences
    const enrolledContactIds = new Set(allEnrollments.map((e) => e.contactId));
    const highScoredCompanies = allCompanies.filter(
      (c) => c.score && c.score >= 70
    );
    const highScoredContactsNoSequence = allContacts.filter(
      (c) =>
        c.companyId &&
        highScoredCompanies.some((co) => co.id === c.companyId) &&
        !enrolledContactIds.has(c.id)
    );
    if (highScoredContactsNoSequence.length >= 3) {
      insights.push({
        id: nextId(),
        title: `${highScoredContactsNoSequence.length} high-value contacts not in sequences`,
        description: `Contacts at top-scored companies have no active outreach.`,
        severity: "high",
        category: "opportunity",
        suggestedAction: "Enroll these contacts in sequences using Autopilot or manual enrollment.",
      });
    }

    // TAM coverage
    const tamCompanies = allCompanies.filter(
      (c) => (c.properties as Record<string, unknown>)?.source === "tam"
    );
    const tamWithDeals = tamCompanies.filter((c) =>
      allDeals.some((d) => d.companyId === c.id)
    );
    if (tamCompanies.length >= 10) {
      const coverage = Math.round((tamWithDeals.length / tamCompanies.length) * 100);
      if (coverage < 30) {
        insights.push({
          id: nextId(),
          title: `TAM coverage at ${coverage}%`,
          description: `Only ${tamWithDeals.length} of ${tamCompanies.length} TAM companies have active deals.`,
          severity: "medium",
          category: "opportunity",
          suggestedAction: "Create deals for top-scored TAM companies to expand pipeline coverage.",
        });
      }
    }

    // Unenriched accounts
    const unenrichedCompanies = allCompanies.filter(
      (c) => !(c.properties as Record<string, unknown>)?.enrichedAt
    );
    if (unenrichedCompanies.length >= 5) {
      insights.push({
        id: nextId(),
        title: `${unenrichedCompanies.length} companies need enrichment`,
        description: `Unenriched companies can't be properly scored or targeted.`,
        severity: "medium",
        category: "opportunity",
        suggestedAction: "Run batch enrichment from the Accounts page.",
      });
    }

    // Sort: critical first, then high, medium, info
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, info: 3 };
    insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return Response.json({ insights: insights.slice(0, 10) });
  } catch (error) {
    console.error("Insights generation failed:", error);
    return Response.json({ error: "Failed to generate insights" }, { status: 500 });
  }
  });
}
