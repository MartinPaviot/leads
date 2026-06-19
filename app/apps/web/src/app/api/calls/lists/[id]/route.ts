/**
 * PATCH  /api/calls/lists/[id]  — edit a sector list (name / segment / sort).
 *                                 If it is the active list, its new segment is
 *                                 re-mirrored onto the campaign audience and
 *                                 today's list regenerated.
 * DELETE /api/calls/lists/[id]  — remove it; if it was active, the top-up
 *                                 reverts to the whole ICP (audience cleared).
 *
 * Tenant-scoped throughout (model A2a, _specs/call-lists).
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { getOwnActiveCampaign, updateCallCampaign, generateDailyCallList } from "@/lib/voice/campaign";
import { getCallList, updateCallList, deleteCallList, coerceSort } from "@/lib/voice/call-lists";
import { validateSprintLabels, countSprintAudience } from "@/lib/voice/call-sprint";
import { readSprintAudience, type SprintAudience } from "@/lib/voice/sprint-audience";

interface PatchBody {
  name?: string;
  segment?: Partial<SprintAudience>;
  sort?: string;
}

function activeListId(targetFilter: unknown): string | null {
  return (targetFilter as { activeListId?: string } | null)?.activeListId ?? null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as PatchBody;

    const existing = await getCallList(authCtx.tenantId, id);
    if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

    let segment: SprintAudience | undefined;
    if (body.segment) {
      const v = await validateSprintLabels(
        authCtx.tenantId,
        body.segment.industries ?? [],
        body.segment.personas ?? [],
      );
      const parsed = readSprintAudience({
        audience: {
          label: body.name ?? existing.name,
          industries: v.industries,
          personas: v.personas,
          signals: body.segment.signals,
          phoneType: body.segment.phoneType,
          fitMin: body.segment.fitMin,
          freshnessDays: body.segment.freshnessDays,
          dealValueMin: body.segment.dealValueMin,
        },
      });
      if (!parsed) {
        return Response.json({ error: "empty_segment" }, { status: 400 });
      }
      segment = parsed;
    }

    const row = await updateCallList({
      tenantId: authCtx.tenantId,
      id,
      name: body.name,
      segment,
      sort: body.sort ? coerceSort(body.sort) : undefined,
    });
    if (!row) return Response.json({ error: "not_found" }, { status: 404 });

    // If this list is currently active, re-mirror its (possibly new) segment so
    // the next top-up reflects the edit; in-cadence retries keep their schedule.
    if (segment) {
      const campaign = await getOwnActiveCampaign(authCtx.tenantId, authCtx.appUserId);
      if (campaign && activeListId(campaign.targetFilter) === id) {
        await updateCallCampaign({ tenantId: authCtx.tenantId, campaignId: campaign.id, audience: segment });
        await generateDailyCallList(campaign.id).catch(() => {});
      }
    }

    const counts = await countSprintAudience(authCtx.tenantId, row.segment);
    return Response.json({ list: { ...row, counts } });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await ctx.params;
    const campaign = await getOwnActiveCampaign(authCtx.tenantId, authCtx.appUserId);
    const wasActive = !!campaign && activeListId(campaign.targetFilter) === id;

    const ok = await deleteCallList(authCtx.tenantId, id);
    if (!ok) return Response.json({ error: "not_found" }, { status: 404 });

    // Deleting the active list reverts the top-up to the whole ICP.
    if (campaign && wasActive) {
      await updateCallCampaign({
        tenantId: authCtx.tenantId,
        campaignId: campaign.id,
        audience: null,
        activeListId: null,
      });
      await generateDailyCallList(campaign.id).catch(() => {});
    }
    return Response.json({ ok: true });
  });
}
