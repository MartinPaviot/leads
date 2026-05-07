import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { recordDealOutcome } from "@/lib/scoring/signal-outcomes";
import { inngest } from "@/inngest/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [deal] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!deal) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    // Attach predictive win probability if a scoring model exists and
    // the deal is still open (not won/lost). Non-blocking — scoring
    // failure never breaks the deal fetch.
    let predictiveScore: { probability: number; topFactors: string[] } | null = null;
    if (deal.stage !== "won" && deal.stage !== "lost") {
      try {
        const { tenants: tenantsTable } = await import("@/db/schema");
        const [tenant] = await db
          .select({ settings: tenantsTable.settings })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, authCtx.tenantId))
          .limit(1);
        const settings = (tenant?.settings || {}) as Record<string, unknown>;
        const model = settings.scoringModel as import("@/lib/scoring/predictive-scorer").ScoringModel | undefined;
        if (model && model.featureWeights && model.sampleSize >= 5) {
          const { scoreDeal, valueToBucket } = await import("@/lib/scoring/predictive-scorer");
          // Quick feature extraction (inline to avoid circular dep)
          const { companies: companiesTable, activities: activitiesTable } = await import("@/db/schema");
          let industry = "unknown";
          let companySize = "unknown";
          if (deal.companyId) {
            const [company] = await db
              .select({ industry: companiesTable.industry, size: companiesTable.size, properties: companiesTable.properties })
              .from(companiesTable).where(eq(companiesTable.id, deal.companyId)).limit(1);
            if (company) {
              industry = company.industry || "unknown";
              companySize = company.size || "unknown";
            }
          }
          predictiveScore = scoreDeal(
            { industry, companySize, valueBucket: valueToBucket(deal.value), stageVelocityDays: Math.max(1, Math.round((Date.now() - new Date(deal.createdAt!).getTime()) / 86400000)), contactsEngaged: 0, meetingCount: 0, emailSentiment: "neutral", hasChampion: false, hasCompetitor: false },
            model,
          );
        }
      } catch {
        // Non-critical — deal still loads without predictive score
      }
    }

    return Response.json({ deal, predictiveScore });
  } catch (error) {
    console.error("Failed to fetch deal:", error);
    return Response.json({ error: "Failed to fetch deal" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { name, stage, value, summary, expectedCloseDate, companyId, contactId, ownerId, closeReason } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updates.name = name.trim();
    if (stage) updates.stage = stage;
    if (value !== undefined) updates.value = value ? parseInt(value) : null;
    if (summary !== undefined) updates.summary = summary;
    if (expectedCloseDate !== undefined) updates.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;
    if (companyId !== undefined) updates.companyId = companyId || null;
    if (contactId !== undefined) updates.contactId = contactId || null;
    if (ownerId !== undefined) updates.ownerId = ownerId || null;

    // Y6 — when a close reason is supplied (won/lost stage change), merge
    // it into deal.properties alongside `closedAt` so the win-rate
    // dashboard can aggregate without touching the main columns. We
    // fetch existing properties first to preserve anything the user set
    // earlier (custom fields, manual tags).
    if (closeReason && typeof closeReason === "object") {
      const reason = typeof closeReason.reason === "string" ? closeReason.reason : null;
      const note = typeof closeReason.note === "string" ? closeReason.note : null;
      if (reason) {
        const [existing] = await db
          .select({ properties: deals.properties })
          .from(deals)
          .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
          .limit(1);
        const priorProps = (existing?.properties ?? {}) as Record<string, unknown>;
        updates.properties = {
          ...priorProps,
          closeReason: reason,
          closeReasonNote: note,
          closedAt: new Date().toISOString(),
        };
      }
    }

    const [updated] = await db
      .update(deals)
      .set(updates)
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
      .returning();

    if (!updated) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    // Primitive ④: when the deal closes, attribute the outcome to any
    // signals that fired on its company so `getSignalMultipliers` can
    // weight future scoring. Fire-and-forget — outcome attribution
    // must never slow or break a user-driven stage change.
    if (stage === "won" || stage === "lost") {
      void recordDealOutcome({
        tenantId: authCtx.tenantId,
        dealId: id,
        outcome: stage,
      }).catch((err) => {
        console.warn("deals/[id]: recordDealOutcome failed (non-blocking)", err);
      });

      // Trigger predictive scoring model retraining so the Naive Bayes
      // weights reflect this latest closed deal. Fire-and-forget.
      void inngest.send({
        name: "scoring/train-model-requested",
        data: { tenantId: authCtx.tenantId },
      }).catch((err) => {
        console.warn("deals/[id]: scoring model retrain trigger failed (non-blocking)", err);
      });

      // Trigger automatic win/loss post-mortem analysis. Runs in the
      // background via Inngest so it never blocks the deal update.
      void inngest.send({
        name: "deal/closed",
        data: { dealId: id, tenantId: authCtx.tenantId, outcome: stage },
      }).catch((err) => {
        console.warn("deals/[id]: win-loss analysis trigger failed (non-blocking)", err);
      });
    }

    return Response.json({ deal: updated });
  } catch (error) {
    console.error("Failed to update deal:", error);
    return Response.json({ error: "Failed to update deal" }, { status: 500 });
  }
}
