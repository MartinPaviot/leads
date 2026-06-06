/**
 * GET  /api/calls/campaign  — the active call campaign (or null) + today's
 *                             call list, queue-shaped for the cockpit, plus
 *                             needsOnboarding (true on first visit = no
 *                             campaign yet).
 * POST /api/calls/campaign  — create a campaign from any objective (a
 *                             structured goal or a free-text phrase parsed by
 *                             an LLM), then generate today's list.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { callCampaigns, companies } from "@/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";
import {
  createCallCampaign,
  generateDailyCallList,
  getTodaysCallList,
  parseGoalPhrase,
  type GoalSpec,
} from "@/lib/voice/campaign";

async function getActiveCampaign(tenantId: string) {
  const [c] = await db
    .select()
    .from(callCampaigns)
    .where(and(eq(callCampaigns.tenantId, tenantId), eq(callCampaigns.status, "active")))
    .orderBy(desc(callCampaigns.createdAt))
    .limit(1);
  return c ?? null;
}

/** Today's targets, mapped to the cockpit's queue-item shape. */
async function todayQueue(tenantId: string) {
  const rows = await getTodaysCallList(tenantId);
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter(Boolean))] as string[];
  const cmap: Record<string, { name: string; domain: string | null }> = {};
  if (companyIds.length > 0) {
    const crows = await db
      .select({ id: companies.id, name: companies.name, domain: companies.domain })
      .from(companies)
      .where(inArray(companies.id, companyIds));
    for (const c of crows) cmap[c.id] = { name: c.name, domain: c.domain };
  }
  return rows.map((r) => ({
    contactId: r.contactId,
    contactName: [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown",
    title: r.title,
    companyName: r.companyId ? cmap[r.companyId]?.name ?? null : null,
    companyDomain: r.companyId ? cmap[r.companyId]?.domain ?? null : null,
    phone: r.phone ?? "",
    score: r.score ?? 0,
    intentScore: Math.min(1, (r.score ?? 0) / 100),
    accessibilityScore: 0.7,
    dealValueWeight: 1,
    localTime: "",
    localTimezone: "",
    latestSignal: r.lastOutcome
      ? { type: "call", label: `Attempt ${r.attemptCount} · ${r.lastOutcome}` }
      : null,
  }));
}

export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const campaign = await getActiveCampaign(authCtx.tenantId);
    const calls = campaign ? await todayQueue(authCtx.tenantId) : [];
    return Response.json({ campaign, calls, needsOnboarding: !campaign });
  });
}

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const body = (await req.json().catch(() => ({}))) as {
      goal?: Partial<GoalSpec>;
      phrase?: string;
      name?: string;
      maxAttempts?: number;
      windowDays?: number;
    };

    // Accept a structured goal, or parse any free-text objective via the LLM.
    let goal: GoalSpec | null = null;
    if (body.goal && body.goal.type && typeof body.goal.target === "number" && body.goal.window) {
      goal = {
        type: body.goal.type,
        target: body.goal.target,
        window: body.goal.window,
        daysPerWeek: body.goal.daysPerWeek,
      };
    } else if (typeof body.phrase === "string" && body.phrase.trim()) {
      goal = await parseGoalPhrase(body.phrase, authCtx.tenantId);
    }

    if (!goal || !(goal.target > 0)) {
      return Response.json(
        { error: "Could not understand the objective. Try e.g. \"1000 calls this week over 5 days\" or \"book 10 demos this month\"." },
        { status: 400 },
      );
    }

    const campaign = await createCallCampaign({
      tenantId: authCtx.tenantId,
      ownerId: authCtx.appUserId,
      name: body.name,
      goal,
      maxAttempts: body.maxAttempts,
      windowDays: body.windowDays,
    });
    await generateDailyCallList(campaign.id);
    const calls = await todayQueue(authCtx.tenantId);

    return Response.json({ campaign, calls });
  });
}
