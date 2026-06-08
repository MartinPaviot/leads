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
import { callCampaigns, companies, contacts } from "@/db/schema";
import { and, eq, desc, inArray, isNull, sql } from "drizzle-orm";
import {
  createCallCampaign,
  updateCallCampaign,
  generateDailyCallList,
  getTodaysCallList,
  parseGoalPhrase,
  type GoalSpec,
} from "@/lib/voice/campaign";
import { hasUsableIcp } from "@/lib/voice/source-prospects";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { inngest } from "@/inngest/client";

/** Count contacts that can actually be dialed (have a phone). */
async function callableCount(tenantId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        isNull(contacts.deletedAt),
        sql`${contacts.phone} IS NOT NULL AND ${contacts.phone} <> ''`,
      ),
    );
  return Number(r?.n ?? 0);
}

/**
 * The current rep's active campaign. Call Mode is individualised per user
 * inside a workspace, so we scope by ownerId (not just tenant) — each user
 * gets their own goal, list and cadence.
 */
async function getActiveCampaign(tenantId: string, ownerId: string) {
  const [c] = await db
    .select()
    .from(callCampaigns)
    .where(and(eq(callCampaigns.tenantId, tenantId), eq(callCampaigns.ownerId, ownerId), eq(callCampaigns.status, "active")))
    .orderBy(desc(callCampaigns.createdAt))
    .limit(1);
  return c ?? null;
}

/** Today's targets for one rep, mapped to the cockpit's queue-item shape. */
async function todayQueue(tenantId: string, ownerId: string) {
  const rows = await getTodaysCallList(tenantId, new Date(), ownerId);
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
    const campaign = await getActiveCampaign(authCtx.tenantId, authCtx.appUserId);
    const calls = campaign ? await todayQueue(authCtx.tenantId, authCtx.appUserId) : [];
    const [callableTotal, settings] = await Promise.all([
      callableCount(authCtx.tenantId),
      getTenantSettings(authCtx.tenantId),
    ]);
    return Response.json({
      campaign,
      calls,
      needsOnboarding: !campaign,
      callableTotal,
      hasIcp: hasUsableIcp(settings),
      sourcing: !!campaign && callableTotal < (campaign.dailyQuota ?? 0),
    });
  });
}

interface CampaignBody {
  goal?: Partial<GoalSpec>;
  phrase?: string;
  name?: string;
  maxAttempts?: number;
  windowDays?: number;
  listFrequency?: "daily" | "weekly";
  workingDays?: number[];
}

/** Accept a structured goal, or parse any free-text objective via the LLM. */
async function resolveGoal(body: CampaignBody, tenantId: string): Promise<GoalSpec | null> {
  if (body.goal && body.goal.type && typeof body.goal.target === "number" && body.goal.window) {
    return {
      type: body.goal.type,
      target: body.goal.target,
      window: body.goal.window,
      daysPerWeek: body.goal.daysPerWeek,
    };
  }
  if (typeof body.phrase === "string" && body.phrase.trim()) {
    return parseGoalPhrase(body.phrase, tenantId);
  }
  return null;
}

/**
 * Guarantee a list: if the callable pool can't cover the daily quota and the
 * tenant has an ICP, kick off sourcing (Apollo -> companies -> people ->
 * enrichment) so the morning list fills. Honest status drives the UI's result
 * step (ready / building / define-ICP).
 */
async function listStatus(tenantId: string, dailyQuota: number) {
  const [callableTotal, settings] = await Promise.all([
    callableCount(tenantId),
    getTenantSettings(tenantId),
  ]);
  const hasIcp = hasUsableIcp(settings);
  const needsSourcing = callableTotal < (dailyQuota ?? 0);
  let sourcing = false;
  if (needsSourcing && hasIcp) {
    sourcing = true;
    inngest
      .send({
        name: "call-campaign/source",
        data: { tenantId, maxCompanies: 40, maxContactsPerCompany: 5 },
      })
      .catch(() => {});
  }
  return { callableTotal, hasIcp, needsSourcing, sourcing };
}

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const body = (await req.json().catch(() => ({}))) as CampaignBody;

    const goal = await resolveGoal(body, authCtx.tenantId);
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
      // User-defined cadence rhythm — drives when the list regenerates.
      targetFilter: {
        listFrequency: body.listFrequency === "weekly" ? "weekly" : "daily",
        workingDays: Array.isArray(body.workingDays) && body.workingDays.length > 0 ? body.workingDays : [1, 2, 3, 4, 5],
      },
    });
    await generateDailyCallList(campaign.id);
    const calls = await todayQueue(authCtx.tenantId, authCtx.appUserId);
    const { callableTotal, hasIcp, needsSourcing, sourcing } = await listStatus(authCtx.tenantId, campaign.dailyQuota ?? 0);

    return Response.json({ campaign, calls, callableTotal, needsSourcing, sourcing, hasIcp });
  });
}

/**
 * PATCH /api/calls/campaign — edit the active campaign's plan (goal + cadence
 * set at onboarding stay changeable). Recomputes the daily quota, regenerates
 * today's list so the change takes effect immediately, and re-checks sourcing.
 */
export async function PATCH(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const body = (await req.json().catch(() => ({}))) as CampaignBody;

    const active = await getActiveCampaign(authCtx.tenantId, authCtx.appUserId);
    if (!active) {
      return Response.json({ error: "No active campaign to update." }, { status: 404 });
    }

    // A goal is optional on edit (the rep may only tweak cadence), but if one
    // is supplied it must be valid.
    const goal = await resolveGoal(body, authCtx.tenantId);
    if ((body.goal || body.phrase) && (!goal || !(goal.target > 0))) {
      return Response.json(
        { error: "Could not understand the objective. Try e.g. \"1000 calls this week over 5 days\" or \"book 10 demos this month\"." },
        { status: 400 },
      );
    }

    const campaign = await updateCallCampaign({
      tenantId: authCtx.tenantId,
      campaignId: active.id,
      name: body.name,
      goal: goal ?? undefined,
      maxAttempts: body.maxAttempts,
      windowDays: body.windowDays,
      listFrequency: body.listFrequency,
      workingDays: body.workingDays,
    });
    if (!campaign) {
      return Response.json({ error: "Campaign not found." }, { status: 404 });
    }

    await generateDailyCallList(campaign.id);
    const calls = await todayQueue(authCtx.tenantId, authCtx.appUserId);
    const { callableTotal, hasIcp, needsSourcing, sourcing } = await listStatus(authCtx.tenantId, campaign.dailyQuota ?? 0);

    return Response.json({ campaign, calls, callableTotal, needsSourcing, sourcing, hasIcp });
  });
}
