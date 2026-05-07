import { db } from "@/db";
import { intelligenceBriefs, companies, contacts, sequenceEnrollments, outboundEmails, inboundVisitors } from "@/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { ALL_PLAYBOOK_SCORERS, type ScoringInput, type Signal } from "./playbook-conditions";
import { findWarmPath } from "./warm-path";
import type { StrategyCandidate, StrategyType, IntelligenceBrief, PreviousOutreach } from "./types";

const FAILURE_PENALTY = -20;

export async function selectStrategy(
  companyId: string,
  tenantId: string,
  contactId?: string
): Promise<StrategyCandidate[]> {
  // 1. Load brief (must exist)
  const briefConditions = [
    eq(intelligenceBriefs.tenantId, tenantId),
    eq(intelligenceBriefs.companyId, companyId),
    gt(intelligenceBriefs.expiresAt, new Date()),
  ];
  if (contactId) {
    briefConditions.push(eq(intelligenceBriefs.contactId, contactId));
  }

  const [briefRow] = await db
    .select()
    .from(intelligenceBriefs)
    .where(and(...briefConditions))
    .limit(1);

  if (!briefRow) {
    throw new StrategyError("BRIEF_NOT_FOUND", "Intelligence brief not found. Generate one first.");
  }

  const brief: IntelligenceBrief = {
    id: briefRow.id,
    tenantId: briefRow.tenantId,
    companyId: briefRow.companyId,
    contactId: briefRow.contactId,
    websiteSummary: briefRow.websiteSummary,
    recentNews: (briefRow.recentNews || []) as IntelligenceBrief["recentNews"],
    jobPostings: (briefRow.jobPostings || []) as IntelligenceBrief["jobPostings"],
    techStack: (briefRow.techStack || []) as IntelligenceBrief["techStack"],
    linkedinActivity: briefRow.linkedinActivity as IntelligenceBrief["linkedinActivity"],
    publicContent: (briefRow.publicContent || []) as IntelligenceBrief["publicContent"],
    competitorDetected: briefRow.competitorDetected,
    communicationStyle: briefRow.communicationStyle as IntelligenceBrief["communicationStyle"],
    painPoints: (briefRow.painPoints || []) as string[],
    bestAngle: briefRow.bestAngle,
    warmthSignals: (briefRow.warmthSignals || []) as IntelligenceBrief["warmthSignals"],
    publicContentDepth: briefRow.publicContentDepth || 0,
    sourcesAttempted: briefRow.sourcesAttempted || 0,
    sourcesSucceeded: briefRow.sourcesSucceeded || 0,
    sourceErrors: (briefRow.sourceErrors || []) as IntelligenceBrief["sourceErrors"],
    researchedAt: briefRow.researchedAt.toISOString(),
    expiresAt: briefRow.expiresAt.toISOString(),
  };

  // 2. Load warm path
  const warmPath = contactId ? await findWarmPath(tenantId, contactId) : null;

  // 3. Load signals from company properties
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.tenantId, tenantId)))
    .limit(1);

  const companyProps = (company?.properties || {}) as Record<string, unknown>;
  const rawSignals = (companyProps.signals || []) as Array<{ type: string; confidence: string; detectedAt?: string }>;
  const signals: Signal[] = rawSignals.map((s) => ({
    type: s.type,
    confidence: (s.confidence as Signal["confidence"]) || "medium",
    detectedAt: s.detectedAt || new Date().toISOString(),
    isNew: s.detectedAt ? hoursSince(s.detectedAt) < 72 : false,
  }));

  // 4. Check for inbound visits
  const hasInboundVisit = contactId
    ? (await db
        .select({ id: inboundVisitors.id })
        .from(inboundVisitors)
        .where(
          and(
            eq(inboundVisitors.tenantId, tenantId),
            eq(inboundVisitors.identifiedCompanyId, companyId),
            gt(inboundVisitors.lastSeenAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          )
        )
        .limit(1)).length > 0
    : false;

  // 5. Load previous outreach history
  const previousOutreach = contactId ? await getPreviousOutreach(contactId) : null;

  // 6. Count available contacts
  const contactsResult = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.companyId, companyId), eq(contacts.tenantId, tenantId)));
  const contactsAvailable = contactsResult.length;

  // 7. Score all playbooks
  const input: ScoringInput = {
    brief,
    warmPath,
    signals,
    previousOutreach,
    contactsAvailable,
    companyScore: company?.score || 0,
    hasInboundVisit,
  };

  const candidates: StrategyCandidate[] = [];

  for (const [strategyId, scorer] of Object.entries(ALL_PLAYBOOK_SCORERS)) {
    const result = scorer(input);
    let adjustedScore = result.score;

    // Apply failure penalty if this strategy was used before and failed
    if (previousOutreach?.strategyUsed === strategyId && previousOutreach.outcome === "no_response") {
      adjustedScore += FAILURE_PENALTY;
    }

    if (adjustedScore > 0) {
      candidates.push({
        strategyId: strategyId as StrategyType,
        score: Math.max(0, Math.min(100, adjustedScore)),
        reason: result.reason,
        activationFactors: result.factors,
      });
    }
  }

  // Sort by score descending, return top 3
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3);
}

async function getPreviousOutreach(contactId: string): Promise<PreviousOutreach | null> {
  const [enrollment] = await db
    .select()
    .from(sequenceEnrollments)
    .where(eq(sequenceEnrollments.contactId, contactId))
    .orderBy(desc(sequenceEnrollments.enrolledAt))
    .limit(1);

  if (!enrollment) return null;

  // Count emails sent in this enrollment
  const emails = await db
    .select({ id: outboundEmails.id })
    .from(outboundEmails)
    .where(eq(outboundEmails.enrollmentId, enrollment.id));

  const outcomeMap: Record<string, PreviousOutreach["outcome"]> = {
    completed: "no_response",
    replied: "replied_positive",
    bounced: "bounced",
    paused: "not_now",
  };

  return {
    strategyUsed: null, // will be filled from enrollment_strategy table once populated
    outcome: (enrollment.status ? outcomeMap[enrollment.status] : null) || "no_response",
    date: enrollment.enrolledAt?.toISOString() || new Date().toISOString(),
    emailsSent: emails.length,
  };
}

function hoursSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60));
}

export class StrategyError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
