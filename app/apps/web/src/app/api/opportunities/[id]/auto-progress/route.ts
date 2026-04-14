import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, deals } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { logger } from "@/lib/logger";

/**
 * POST /api/opportunities/:id/auto-progress — Y3.
 *
 * Suggests (default) or applies a next-stage transition based on deal
 * signals. v1 rules are intentionally conservative so an accidental
 * auto-apply can't push a deal to `won` without explicit human
 * confirmation. The endpoint returns the suggestion; pass
 * `{ apply: true }` in the body to actually update the deal.
 *
 * Rule matrix (lead → qualification → demo → trial → proposal →
 * negotiation → won/lost):
 *   - lead          → qualification   when ≥1 inbound reply
 *   - qualification → demo            when ≥1 meeting_scheduled
 *   - demo          → trial           when meeting_completed + outbound email in last 7d
 *   - trial         → proposal        when proposal/contract activity tag present
 *   - proposal      → negotiation     when ≥2 replies after proposal
 *
 * Never auto-advances to `won` or `lost` — those transitions have
 * financial side-effects and should stay human-approved.
 */

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteCtx) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { apply?: boolean };
  const apply = body.apply === true;

  try {
    const [deal] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const recent = await db
      .select({
        type: activities.activityType,
        direction: activities.direction,
        occurredAt: activities.occurredAt,
        summary: activities.summary,
      })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          eq(activities.entityType, "deal"),
          eq(activities.entityId, id)
        )
      )
      .orderBy(desc(activities.occurredAt))
      .limit(200);

    const suggestion = suggestNextStage(deal.stage ?? "lead", recent);

    if (!suggestion) {
      return NextResponse.json({
        currentStage: deal.stage,
        suggestion: null,
      });
    }

    if (apply) {
      await db
        .update(deals)
        .set({ stage: suggestion.next as typeof deal.stage, updatedAt: new Date() })
        .where(eq(deals.id, id));
      await db.insert(activities).values({
        tenantId: authCtx.tenantId,
        actorType: "system",
        entityType: "deal",
        entityId: id,
        activityType: "deal_stage_changed",
        channel: "system",
        direction: "internal",
        summary: `Auto-progressed ${deal.stage} → ${suggestion.next}: ${suggestion.reason}`,
        occurredAt: new Date(),
        metadata: {
          autoProgressed: true,
          from: deal.stage,
          to: suggestion.next,
          reason: suggestion.reason,
        },
      });
    }

    return NextResponse.json({
      currentStage: deal.stage,
      suggestion,
      applied: apply,
    });
  } catch (err) {
    logger.error("opps: auto-progress failed", { err, dealId: id });
    return NextResponse.json(
      { error: "Failed to compute next stage." },
      { status: 500 }
    );
  }
}

interface Recent {
  type: string | null;
  direction: string | null;
  occurredAt: Date | null;
  summary: string | null;
}

export interface StageSuggestion {
  next: string;
  reason: string;
  confidence: "low" | "medium" | "high";
}

/**
 * Pure stage-transition rule engine. Exported for tests.
 */
export function suggestNextStage(
  stage: string,
  recent: Recent[]
): StageSuggestion | null {
  const has = (pred: (r: Recent) => boolean) => recent.some(pred);
  const count = (pred: (r: Recent) => boolean) => recent.filter(pred).length;
  const withinDays = (days: number, r: Recent): boolean =>
    r.occurredAt !== null && Date.now() - r.occurredAt.getTime() < days * 86400000;

  switch (stage) {
    case "lead":
      if (has((r) => r.type === "email_replied" && r.direction === "inbound")) {
        return {
          next: "qualification",
          reason: "Contact replied to outreach",
          confidence: "high",
        };
      }
      return null;

    case "qualification":
      if (has((r) => r.type === "meeting_scheduled")) {
        return {
          next: "demo",
          reason: "Discovery / demo meeting is on the calendar",
          confidence: "high",
        };
      }
      return null;

    case "demo":
      if (
        has((r) => r.type === "meeting_completed") &&
        has((r) => r.type === "email_sent" && withinDays(7, r))
      ) {
        return {
          next: "trial",
          reason: "Demo completed + follow-up email sent within 7 days",
          confidence: "medium",
        };
      }
      return null;

    case "trial":
      if (
        has((r) => {
          const s = r.summary?.toLowerCase() ?? "";
          return s.includes("proposal") || s.includes("contract");
        })
      ) {
        return {
          next: "proposal",
          reason: "Proposal or contract mentioned in an activity",
          confidence: "medium",
        };
      }
      return null;

    case "proposal":
      if (count((r) => r.type === "email_replied" && r.direction === "inbound") >= 2) {
        return {
          next: "negotiation",
          reason: "Multiple replies after proposal signals negotiation",
          confidence: "medium",
        };
      }
      return null;

    default:
      // `negotiation`, `won`, `lost` — never auto-advance. The user
      // confirms these explicitly to avoid flipping revenue numbers
      // without a human in the loop.
      return null;
  }
}
