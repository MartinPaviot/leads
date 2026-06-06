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

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const body = (await req.json().catch(() => ({}))) as {
      goal?: Partial<GoalSpec>;
      phrase?: string;
      name?: string;
      maxAttempts?: number;
      windowDays?: number;
      listFrequency?: "daily" | "weekly";
      workingDays?: number[];
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
      // User-defined cadence rhythm — drives when the list regenerates.
      targetFilter: {
        listFrequency: body.listFrequency === "weekly" ? "weekly" : "daily",
        workingDays: Array.isArray(body.workingDays) && body.workingDays.length > 0 ? body.workingDays : [1, 2, 3, 4, 5],
      },
    });
    await generateDailyCallList(campaign.id);
    const calls = await todayQueue(authCtx.tenantId);

    // Guarantee a list: if the callable pool can't cover the daily quota and
    // the tenant has an ICP, kick off sourcing (Apollo -> companies -> people
    // -> enrichment) so the morning list fills. Honest status drives the
    // onboarding's result step (ready / building / define-ICP).
    const [callableTotal, settings] = await Promise.all([
      callableCount(authCtx.tenantId),
      getTenantSettings(authCtx.tenantId),
    ]);
    const hasIcp = hasUsableIcp(settings);
    const needsSourcing = callableTotal < (campaign.dailyQuota ?? 0);
    let sourcing = false;
    if (needsSourcing && hasIcp) {
      sourcing = true;
      inngest
        .send({
          name: "call-campaign/source",
          data: { tenantId: authCtx.tenantId, maxCompanies: 40, maxContactsPerCompany: 5 },
        })
        .catch(() => {});
    }

    return Response.json({ campaign, calls, callableTotal, needsSourcing, sourcing, hasIcp });
  });
}
