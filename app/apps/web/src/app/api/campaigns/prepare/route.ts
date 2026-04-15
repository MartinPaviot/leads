import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { sequences, sequenceSteps } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import type { CampaignConfig } from "@/lib/campaign-types";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      sequenceId,
      segmentFilters = {},
      targetRoles = [],
      maxCompanies = 50,
      maxContactsPerCompany = 3,
    } = body;

    if (!sequenceId) {
      return Response.json({ error: "sequenceId required" }, { status: 400 });
    }

    // Validate sequence exists, belongs to tenant
    const [sequence] = await db
      .select()
      .from(sequences)
      .where(and(eq(sequences.id, sequenceId), eq(sequences.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!sequence) {
      return Response.json({ error: "Sequence not found" }, { status: 404 });
    }

    // Validate sequence has steps
    const [stepCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId));

    if (!stepCount || Number(stepCount.count) === 0) {
      return Response.json({ error: "Sequence has no steps — add at least one step before launching" }, { status: 400 });
    }

    // Save campaign config
    const config: CampaignConfig = {
      segmentFilters,
      targetRoles,
      maxCompanies: Math.min(maxCompanies, 500),
      maxContactsPerCompany: Math.min(maxContactsPerCompany, 5),
      status: "preparing",
    };

    await db
      .update(sequences)
      .set({ campaignConfig: config, updatedAt: new Date() })
      .where(eq(sequences.id, sequenceId));

    // Fire async preparation
    await inngest.send({
      name: "campaign/prepare",
      data: {
        sequenceId,
        tenantId: authCtx.tenantId,
        userId: authCtx.userId,
        config,
      },
    });

    return Response.json({ accepted: true, sequenceId }, { status: 202 });
  } catch (error) {
    console.error("Campaign prepare failed:", error);
    return Response.json({ error: "Campaign preparation failed" }, { status: 500 });
  }
}
