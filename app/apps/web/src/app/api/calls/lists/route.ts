/**
 * GET  /api/calls/lists  — the rep's lists for the "To call now" selector:
 *   system by-day lists (Today / Callbacks due / New, derived from today's
 *   target state) + their sector lists (from call_lists) with honest counts,
 *   and which sector list is currently active.
 * POST /api/calls/lists  — create a sector list from a free-text phrase (LLM
 *   resolved, fail-closed) or an explicit segment (labels validated verbatim).
 *
 * Model A2a (_specs/call-lists): one global campaign per rep owns the quota +
 * cadence; lists are views/segments over its gated candidate pool.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { getOwnActiveCampaign, getTodaysCallList } from "@/lib/voice/campaign";
import { listCallLists, createCallList, coerceSort } from "@/lib/voice/call-lists";
import { resolveSprintAudience, validateSprintLabels, countSprintAudience } from "@/lib/voice/call-sprint";
import { readSprintAudience, type SprintAudience } from "@/lib/voice/sprint-audience";

/** System "by-day" lists derived from today's targets (partition by attempts). */
function systemLists(today: Array<{ attemptCount: number | null }>) {
  const callbacks = today.filter((t) => (t.attemptCount ?? 0) > 0).length;
  const fresh = today.filter((t) => (t.attemptCount ?? 0) === 0).length;
  return [
    { id: "today", kind: "system" as const, name: "Today", count: today.length },
    { id: "callbacks_due", kind: "system" as const, name: "Callbacks due", count: callbacks },
    { id: "new", kind: "system" as const, name: "New to call", count: fresh },
  ];
}

export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const campaign = await getOwnActiveCampaign(authCtx.tenantId, authCtx.appUserId);
    const today = campaign
      ? await getTodaysCallList(authCtx.tenantId, new Date(), authCtx.appUserId)
      : [];
    const system = systemLists(today);

    let sector: Array<Record<string, unknown>> = [];
    let activeListId: string | null = null;
    if (campaign) {
      activeListId =
        (campaign.targetFilter as { activeListId?: string } | null)?.activeListId ?? null;
      const lists = await listCallLists(authCtx.tenantId, campaign.id);
      sector = await Promise.all(
        lists.map(async (l) => ({
          id: l.id,
          kind: "sector" as const,
          name: l.name,
          sort: l.sort,
          segment: l.segment,
          counts: await countSprintAudience(authCtx.tenantId, l.segment),
        })),
      );
    }
    return Response.json({ system, sector, activeListId, hasCampaign: !!campaign });
  });
}

interface CreateBody {
  name?: string;
  phrase?: string;
  segment?: Partial<SprintAudience>;
  sort?: string;
}

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const body = (await req.json().catch(() => ({}))) as CreateBody;
    const campaign = await getOwnActiveCampaign(authCtx.tenantId, authCtx.appUserId);
    if (!campaign) {
      return Response.json(
        { error: "no_campaign", message: "Set a calling plan first, then create lists." },
        { status: 400 },
      );
    }

    let segment: SprintAudience | null = null;
    let name = (body.name ?? "").trim();

    if (typeof body.phrase === "string" && body.phrase.trim()) {
      // LLM splits the phrase into sector × persona facets, validated verbatim.
      const { audience } = await resolveSprintAudience(body.phrase, authCtx.tenantId);
      segment = readSprintAudience({ audience }); // sanitise; null if empty
      if (!name && segment) name = segment.label;
    } else if (body.segment) {
      // Explicit segment: validate industry/persona labels verbatim, then
      // sanitise the whole shape (numeric/enum facets) through readSprintAudience.
      const v = await validateSprintLabels(
        authCtx.tenantId,
        body.segment.industries ?? [],
        body.segment.personas ?? [],
      );
      segment = readSprintAudience({
        audience: {
          label: name || "Liste",
          industries: v.industries,
          personas: v.personas,
          signals: body.segment.signals,
          phoneType: body.segment.phoneType,
          fitMin: body.segment.fitMin,
          freshnessDays: body.segment.freshnessDays,
          dealValueMin: body.segment.dealValueMin,
        },
      });
    }

    if (!segment) {
      return Response.json(
        {
          error: "empty_segment",
          message: "Could not resolve any target — refine the sector/persona or add a filter.",
        },
        { status: 400 },
      );
    }

    const row = await createCallList({
      tenantId: authCtx.tenantId,
      campaignId: campaign.id,
      ownerId: authCtx.appUserId,
      name: name || segment.label,
      segment,
      sort: coerceSort(body.sort),
    });
    const counts = await countSprintAudience(authCtx.tenantId, segment);
    return Response.json({ list: { ...row, counts } });
  });
}
