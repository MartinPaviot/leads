/**
 * POST /api/calls/lists/[id]/activate
 *
 * Make a sector list the active one: mirror its segment onto the campaign
 * audience (what the daily top-up reads) + stamp it active, then regenerate
 * today's list so the change takes effect immediately. In-cadence retries keep
 * their committed schedule (R0.2) — only the fresh top-up follows the new list.
 *
 * The special id "all" clears the sprint (top-up reverts to the whole ICP
 * ranked by fit) — the selector's way back from a sector list. System by-day
 * lists (today / callbacks_due / new) are client-side partitions and never
 * call this route.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { getOwnActiveCampaign, updateCallCampaign, generateDailyCallList } from "@/lib/voice/campaign";
import { getCallList } from "@/lib/voice/call-lists";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await ctx.params;
    const campaign = await getOwnActiveCampaign(authCtx.tenantId, authCtx.appUserId);
    if (!campaign) return Response.json({ error: "no_campaign" }, { status: 400 });

    if (id === "all") {
      await updateCallCampaign({
        tenantId: authCtx.tenantId,
        campaignId: campaign.id,
        audience: null,
        activeListId: null,
      });
      const gen = await generateDailyCallList(campaign.id);
      return Response.json({
        ok: true,
        activeListId: null,
        listed: gen.listed,
        retriesDue: gen.retriesDue,
        newlyAdded: gen.newlyAdded,
      });
    }

    const list = await getCallList(authCtx.tenantId, id);
    if (!list) return Response.json({ error: "not_found" }, { status: 404 });

    await updateCallCampaign({
      tenantId: authCtx.tenantId,
      campaignId: campaign.id,
      audience: list.segment,
      activeListId: list.id,
    });
    const gen = await generateDailyCallList(campaign.id);
    return Response.json({
      ok: true,
      activeListId: list.id,
      listed: gen.listed,
      retriesDue: gen.retriesDue,
      newlyAdded: gen.newlyAdded,
    });
  });
}
