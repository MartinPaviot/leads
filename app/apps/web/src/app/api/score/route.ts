import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { companies, activities, companyIcpFit, icps } from "@/db/schema";
import { eq, and, gte, sql, isNull, inArray } from "drizzle-orm";
import { getTenantSettings, parseSizeRange } from "@/lib/config/tenant-settings";
import { calculateFitScore, getGrade } from "@/lib/scoring/scoring";
import { resolvePrimaryIcp, type IcpFitCell } from "@/lib/icp/criteria-engine";
import { PRIMARY_FIT_THRESHOLD } from "@/lib/icp/fit-recompute-core";
import { getSignalMultipliers } from "@/lib/scoring/signal-outcomes";
import { scoreSignals } from "@/lib/scoring/score-with-signals";

async function calculateEngagementScore(
  tenantId: string,
  companyId: string
): Promise<{ score: number; reasons: string[] }> {
  let score = 0;
  const reasons: string[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Count email activities in last 30 days
  const [emailCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, companyId),
        gte(activities.occurredAt, thirtyDaysAgo),
        isNull(activities.deletedAt)
      )
    );

  const emails = Number(emailCount?.count || 0);
  if (emails > 10) { score += 25; reasons.push(`${emails} interactions in last 30 days`); }
  else if (emails > 5) { score += 15; }
  else if (emails > 0) { score += 8; }

  // Meeting activities
  const [meetingCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, companyId),
        sql`activity_type IN ('meeting_scheduled', 'meeting_completed')`,
        gte(activities.occurredAt, thirtyDaysAgo),
        isNull(activities.deletedAt)
      )
    );

  const meetings = Number(meetingCount?.count || 0);
  if (meetings > 0) {
    score += Math.min(25, meetings * 12);
    reasons.push(`${meetings} meeting(s) in last 30 days`);
  }

  // Recency of last contact
  const [lastActivity] = await db
    .select({ latest: sql<string>`max(occurred_at)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, companyId),
        isNull(activities.deletedAt)
      )
    );

  if (lastActivity?.latest) {
    const daysSince = Math.floor(
      (Date.now() - new Date(lastActivity.latest).getTime()) / 86400000
    );
    if (daysSince <= 3) { score += 20; reasons.push(`Last contact: ${daysSince} days ago`); }
    else if (daysSince <= 7) { score += 15; }
    else if (daysSince <= 14) { score += 10; }
    else if (daysSince <= 30) { score += 5; }
  }

  // Positive replies
  const [positiveCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, companyId),
        eq(activities.sentiment, "positive"),
        isNull(activities.deletedAt)
      )
    );

  const positives = Number(positiveCount?.count || 0);
  if (positives > 0) {
    score += Math.min(15, positives * 8);
    reasons.push(`${positives} positive interaction(s)`);
  }

  // Multi-thread (multiple contacts at same company)
  const [threadCount] = await db
    .select({ count: sql<number>`count(DISTINCT actor_id)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, companyId),
        eq(activities.actorType, "contact"),
        isNull(activities.deletedAt)
      )
    );

  const threads = Number(threadCount?.count || 0);
  if (threads > 1) {
    score += Math.min(15, threads * 5);
    reasons.push(`Multi-threaded: ${threads} contacts engaged`);
  }

  return { score: Math.min(100, score), reasons };
}

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

    if (!companyIds || !Array.isArray(companyIds)) {
      return Response.json({ error: "companyIds array required" }, { status: 400 });
    }
    // Empty batch: nothing to score (and drizzle's inArray rejects []).
    if (companyIds.length === 0) {
      return Response.json({ success: true, scored: 0 });
    }

    // Load typed tenant settings
    const settings = await getTenantSettings(authCtx.tenantId);

    const icpFromSettings: {
      industries?: string[];
      sizeRange?: [number, number];
      geographies?: string[];
    } = {};

    if (settings.targetIndustries?.length) icpFromSettings.industries = settings.targetIndustries;
    const sizeRange = parseSizeRange(settings);
    if (sizeRange) icpFromSettings.sizeRange = sizeRange;
    if (settings.targetGeographies?.length) icpFromSettings.geographies = settings.targetGeographies;

    // Primitive ④ live wire — fetch once per request and reuse across
    // the batch. Multipliers are per-tenant, not per-company, so
    // N round-trips to `signal_outcomes` in a 1000-company score run
    // would be wasteful.
    const { multipliers: signalMultipliers } = await getSignalMultipliers(
      authCtx.tenantId,
    );

    // R1.5 (_specs/icp-unification): when the tenant has active ICP
    // profiles, the fit component is the profile matrix (mirrored
    // 0-100), not the legacy flat-settings heuristic. One query for
    // the whole batch; companies without cells fall back to legacy so
    // manual rescore keeps working for matrix-less tenants.
    const cellRows = await db
      .select({
        companyId: companyIcpFit.companyId,
        icpId: companyIcpFit.icpId,
        fitScore: companyIcpFit.fitScore,
        priority: icps.priority,
      })
      .from(companyIcpFit)
      .innerJoin(icps, eq(icps.id, companyIcpFit.icpId))
      .where(
        and(
          eq(companyIcpFit.tenantId, authCtx.tenantId),
          inArray(companyIcpFit.companyId, companyIds as string[]),
          eq(icps.status, "active"),
          isNull(icps.deletedAt),
        ),
      );
    const matrixCells = new Map<string, IcpFitCell[]>();
    for (const r of cellRows) {
      const list = matrixCells.get(r.companyId) ?? [];
      list.push({ icpId: r.icpId, priority: r.priority, fitScore: r.fitScore });
      matrixCells.set(r.companyId, list);
    }

    let scored = 0;

    for (const id of companyIds) {
      try {
        const [company] = await db
          .select()
          .from(companies)
          .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
          .limit(1);

        if (!company) continue;

        const props = (company.properties || {}) as Record<string, unknown>;

        // Fit: profile matrix first (0-100 mirror of the primary ICP's
        // blended fit), legacy flat-settings scorer when no cells.
        const cellsForCompany = matrixCells.get(id) ?? [];
        const primary = resolvePrimaryIcp(cellsForCompany, PRIMARY_FIT_THRESHOLD);
        const fit =
          cellsForCompany.length > 0
            ? primary
              ? {
                  score: Math.round(100 * primary.fitScore),
                  reasons: [`ICP profile fit: ${Math.round(100 * primary.fitScore)}/100`],
                }
              : { score: 0, reasons: ["No ICP profile fits at 50% or more"] }
            : calculateFitScore(company, props, icpFromSettings);

        // Calculate Engagement score (from activities)
        const engagement = await calculateEngagementScore(authCtx.tenantId, id);

        // Signal-weighted bonus from the outcome-driven multipliers.
        // Each fired signal contributes BASE_BONUS × learned lift
        // (1× neutral for new tenants / rare signals).
        const signals = scoreSignals(props, signalMultipliers);

        // Adaptive weighting: if no engagement yet (new TAM company), weight fit 100%.
        // As engagement grows, blend in up to 40% engagement weight.
        const hasEngagement = engagement.score > 0;
        const fitWeight = hasEngagement ? 0.6 : 1.0;
        const engWeight = hasEngagement ? 0.4 : 0.0;
        const baseBlend = fit.score * fitWeight + engagement.score * engWeight;
        const totalScore = Math.min(100, Math.round(baseBlend + signals.bonus));
        const allReasons = [...fit.reasons, ...engagement.reasons, ...signals.reasons];

        // Determine grade using shared thresholds
        const { grade } = getGrade(totalScore);

        await db
          .update(companies)
          .set({
            score: totalScore,
            scoreReasons: allReasons,
            properties: {
              ...props,
              score_grade: grade,
              score_fit: fit.score,
              score_engagement: engagement.score,
              score_signal_bonus: signals.bonus,
              score_signal_contributions: signals.contributions,
              score_fit_reasons: fit.reasons,
              score_engagement_reasons: engagement.reasons,
              score_signal_reasons: signals.reasons,
              scored_at: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)));

        scored++;
      } catch (err) {
        console.warn(`Failed to score company ${id}:`, err);
      }
    }

    return Response.json({ success: true, scored });
  } catch (error) {
    console.error("Scoring failed:", error);
    return Response.json({ error: "Scoring failed" }, { status: 500 });
  }
}
