/**
 * Admin API — Prompt Experiment CRUD
 *
 * GET  /api/admin/experiments         — list all experiments (filterable by agentId, status)
 * POST /api/admin/experiments         — create a new experiment
 * PATCH /api/admin/experiments        — update an experiment (conclude, cancel, adjust traffic)
 * DELETE /api/admin/experiments?id=X  — delete an experiment (only draft/canceled)
 */

import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { promptExperiments } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { concludeExpiredExperiments, type ExperimentResults } from "@/lib/prompts/prompt-experiments";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const status = url.searchParams.get("status") as "active" | "concluded" | "canceled" | null;

  const conditions = [];
  if (agentId) conditions.push(eq(promptExperiments.agentId, agentId));
  if (status) conditions.push(eq(promptExperiments.status, status));

  const rows = await db
    .select()
    .from(promptExperiments)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(promptExperiments.createdAt))
    .limit(50);

  return Response.json({
    experiments: rows.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      name: r.name,
      basePromptHash: r.basePromptHash,
      variantPromptDelta: r.variantPromptDelta,
      trafficPercent: r.trafficPercent,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status,
      results: r.results as ExperimentResults | null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });

  const { agentId, name, basePromptHash, variantPromptDelta, trafficPercent, startsAt, endsAt } = body;

  // Validation
  if (!agentId || typeof agentId !== "string") {
    return Response.json({ error: "agentId is required (string)" }, { status: 400 });
  }
  if (!name || typeof name !== "string") {
    return Response.json({ error: "name is required (string)" }, { status: 400 });
  }
  if (!basePromptHash || typeof basePromptHash !== "string") {
    return Response.json({ error: "basePromptHash is required (string)" }, { status: 400 });
  }
  if (!variantPromptDelta || typeof variantPromptDelta !== "string") {
    return Response.json({ error: "variantPromptDelta is required (string)" }, { status: 400 });
  }
  if (typeof trafficPercent !== "number" || trafficPercent < 0 || trafficPercent > 100) {
    return Response.json({ error: "trafficPercent must be 0-100" }, { status: 400 });
  }
  if (!startsAt || !endsAt) {
    return Response.json({ error: "startsAt and endsAt are required (ISO dates)" }, { status: 400 });
  }

  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return Response.json({ error: "Invalid date format for startsAt or endsAt" }, { status: 400 });
  }
  if (endDate <= startDate) {
    return Response.json({ error: "endsAt must be after startsAt" }, { status: 400 });
  }

  // Check for conflicting active experiments on the same agent
  const existing = await db
    .select({ id: promptExperiments.id, name: promptExperiments.name })
    .from(promptExperiments)
    .where(
      and(
        eq(promptExperiments.agentId, agentId),
        eq(promptExperiments.status, "active"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return Response.json(
      { error: `Agent "${agentId}" already has an active experiment: "${existing[0].name}" (${existing[0].id}). Cancel it first.` },
      { status: 409 },
    );
  }

  const [row] = await db
    .insert(promptExperiments)
    .values({
      agentId,
      name,
      basePromptHash,
      variantPromptDelta,
      trafficPercent,
      startsAt: startDate,
      endsAt: endDate,
      status: "active",
    })
    .returning();

  return Response.json({ experiment: row }, { status: 201 });
}

export async function PATCH(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = await req.json().catch(() => null);
  if (!body || !body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { id, action, trafficPercent } = body;

  // Fetch current experiment
  const [exp] = await db
    .select()
    .from(promptExperiments)
    .where(eq(promptExperiments.id, id))
    .limit(1);

  if (!exp) return Response.json({ error: "Experiment not found" }, { status: 404 });

  if (action === "cancel") {
    if (exp.status !== "active") {
      return Response.json({ error: "Can only cancel active experiments" }, { status: 400 });
    }
    const [updated] = await db
      .update(promptExperiments)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(promptExperiments.id, id))
      .returning();
    return Response.json({ experiment: updated });
  }

  if (action === "conclude") {
    if (exp.status !== "active") {
      return Response.json({ error: "Can only conclude active experiments" }, { status: 400 });
    }
    // Force-conclude: set endsAt to now and run the conclusion logic
    await db
      .update(promptExperiments)
      .set({ endsAt: new Date(), updatedAt: new Date() })
      .where(eq(promptExperiments.id, id));

    const concluded = await concludeExpiredExperiments();
    if (concluded === 0) {
      // Edge case: no metrics recorded yet — just mark as concluded with empty results
      await db
        .update(promptExperiments)
        .set({
          status: "concluded",
          results: {
            baseEvalScore: 0,
            variantEvalScore: 0,
            baseApprovalRate: 0,
            variantApprovalRate: 0,
            sampleSize: 0,
            winner: "inconclusive",
          },
          updatedAt: new Date(),
        })
        .where(eq(promptExperiments.id, id));
    }

    const [updated] = await db
      .select()
      .from(promptExperiments)
      .where(eq(promptExperiments.id, id));
    return Response.json({ experiment: updated });
  }

  if (typeof trafficPercent === "number" && trafficPercent >= 0 && trafficPercent <= 100) {
    if (exp.status !== "active") {
      return Response.json({ error: "Can only adjust traffic on active experiments" }, { status: 400 });
    }
    const [updated] = await db
      .update(promptExperiments)
      .set({ trafficPercent, updatedAt: new Date() })
      .where(eq(promptExperiments.id, id))
      .returning();
    return Response.json({ experiment: updated });
  }

  return Response.json({ error: "No valid action or update specified" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id query param required" }, { status: 400 });

  const [exp] = await db
    .select()
    .from(promptExperiments)
    .where(eq(promptExperiments.id, id))
    .limit(1);

  if (!exp) return Response.json({ error: "Experiment not found" }, { status: 404 });

  if (exp.status === "active") {
    return Response.json(
      { error: "Cannot delete an active experiment. Cancel it first." },
      { status: 400 },
    );
  }

  await db.delete(promptExperiments).where(eq(promptExperiments.id, id));
  return Response.json({ deleted: true });
}
