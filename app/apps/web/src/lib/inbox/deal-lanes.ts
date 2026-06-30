import { db } from "@/db";
import { deals } from "@/db/schema";
import { and, eq, isNull, notInArray, gte, desc, or } from "drizzle-orm";

/**
 * Deal folders (roadmap P1). The founder's worry with a score-reranked inbox is
 * that it feels like "désordre" — the list reshuffles and you lose your place. So
 * instead of re-ordering the main inbox, we give each ACTIVE OPEN deal its own
 * stable folder in the sidebar (reusing the customLane mechanism: a deal lane id
 * is `deal:<dealId>`, the existing ?lane= selection/URL/filter plumbing carries
 * it). The main Boîte de réception stays in its predictable order.
 *
 * "Active open" = not won/lost, touched within `activeDays`, capped at `limit`,
 * hottest stage first then most-recent — so the pipeline a founder is actually
 * working sits at the top and the folder count stays bounded.
 */

export const DEAL_LANE_PREFIX = "deal:";
/** Open stages (deal_stage enum minus won/lost). */
export const OPEN_DEAL_STAGES = ["lead", "qualification", "demo", "trial", "proposal", "negotiation"] as const;
const STAGE_RANK: Record<string, number> = {
  lead: 1, qualification: 2, demo: 3, trial: 4, proposal: 5, negotiation: 6,
};

export interface DealRow {
  id: string;
  name: string;
  stage: string | null;
  contactId: string | null;
}

export interface DealLane {
  /** customLane id understood by the inbox: `deal:<dealId>`. */
  id: string;
  dealId: string;
  name: string;
  stage: string;
  /** The deal's primary contact — a conversation belongs to this lane when its
   *  contactId matches (account-level fan-out across all the company's contacts
   *  is a follow-up). */
  contactId: string | null;
  /** Higher = more advanced stage (hotter); drives the "hottest first" order. */
  stageRank: number;
}

/** Build a deal id into a lane id, and detect/parse a deal lane id. */
export function dealLaneId(dealId: string): string {
  return `${DEAL_LANE_PREFIX}${dealId}`;
}
export function isDealLaneId(laneId: string | null | undefined): boolean {
  return typeof laneId === "string" && laneId.startsWith(DEAL_LANE_PREFIX);
}

/**
 * Pure: shape raw deal rows into lanes, order hottest-stage-then-recency, cap.
 * Expects `rows` already ordered most-recent-first (stable sort preserves that
 * within a stage rank). Testable without a DB.
 */
export function rankDealLanes(rows: DealRow[], limit = 12): DealLane[] {
  const ranked = rows
    .map((r) => ({
      id: dealLaneId(r.id),
      dealId: r.id,
      name: (r.name || "").trim() || "Deal",
      stage: r.stage ?? "lead",
      contactId: r.contactId ?? null,
      stageRank: STAGE_RANK[r.stage ?? "lead"] ?? 0,
    }))
    .sort((a, b) => b.stageRank - a.stageRank);
  // Dedup by primary contact: two open deals on the same contact would render as
  // identical folders (same threads). Keep the hottest (first after the sort).
  const seen = new Set<string>();
  const deduped = ranked.filter((l) => {
    if (!l.contactId) return true;
    if (seen.has(l.contactId)) return false;
    seen.add(l.contactId);
    return true;
  });
  return deduped.slice(0, Math.max(0, limit));
}

/**
 * The active-open deals that earn an inbox folder. Fail-soft: any error → [] so
 * the inbox renders without deal folders rather than 500.
 */
export async function loadActiveDealLanes(
  tenantId: string,
  opts?: { activeDays?: number; limit?: number },
): Promise<DealLane[]> {
  const activeDays = opts?.activeDays ?? 30;
  const limit = opts?.limit ?? 12;
  const since = new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000);
  try {
    const rows = await db
      .select({ id: deals.id, name: deals.name, stage: deals.stage, contactId: deals.contactId })
      .from(deals)
      .where(
        and(
          eq(deals.tenantId, tenantId),
          isNull(deals.deletedAt),
          // `NOT IN ('won','lost')` is NULL (excluded) for a NULL stage, but a
          // stage-less deal is still OPEN — keep it.
          or(isNull(deals.stage), notInArray(deals.stage, ["won", "lost"])),
          gte(deals.updatedAt, since),
        ),
      )
      .orderBy(desc(deals.updatedAt))
      .limit(80); // buffer; the route counts mail + caps after the has-mail filter
    return rankDealLanes(rows as DealRow[], limit);
  } catch {
    return [];
  }
}
