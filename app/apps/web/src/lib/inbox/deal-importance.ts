/**
 * P1 — deal-ranked inbox. Pure, unit-tested helpers that turn a contact's deals +
 * title into the `ImportanceInput` fields the inbox scorer (importance.ts) already
 * supports but never received (`hasOpenDeal`, `dealStageRank`, `senioritySenior`).
 *
 * No DB / no clock here — the loader (lib/inbox/load.ts#importanceByContactId)
 * fetches the rows in one batched query and feeds them through `contactImportance`,
 * so the ranking decision stays testable without a database.
 *
 * Stage order mirrors db/schema/enums.ts `dealStageEnum`:
 *   lead < qualification < demo < trial < proposal < negotiation  (then won/lost = CLOSED).
 * A higher rank = later stage = worth more (importance.ts weights it `rank * 5`).
 * won/lost are CLOSED: a closed deal is not an open-pipeline reason to reply, so it
 * never sets `hasOpenDeal`.
 */

const STAGE_RANK: Record<string, number> = {
  lead: 0,
  qualification: 1,
  demo: 2,
  trial: 3,
  proposal: 4,
  negotiation: 5,
};

/** True only for an OPEN pipeline stage (won/lost and unknown stages excluded). */
export function isOpenStage(stage: string | null | undefined): boolean {
  return stage != null && Object.prototype.hasOwnProperty.call(STAGE_RANK, stage);
}

/** 0 = earliest open stage, 5 = negotiation. Closed/unknown → 0. */
export function dealStageRank(stage: string | null | undefined): number {
  return stage != null ? STAGE_RANK[stage] ?? 0 : 0;
}

/** The MOST-ADVANCED open deal among a contact's deals (proposal beats lead), or
 *  null when the contact has no open deal. */
export function pickOpenDeal(
  deals: Array<{ stage: string | null }>,
): { stage: string; rank: number } | null {
  let best: { stage: string; rank: number } | null = null;
  for (const d of deals) {
    if (!isOpenStage(d.stage)) continue;
    const rank = dealStageRank(d.stage);
    if (!best || rank > best.rank) best = { stage: d.stage as string, rank };
  }
  return best;
}

// Exec/lead seniority from a free-text job title. Word-boundary anchored so
// "Director" matches but "Directory" / "Presidential" do not, and "VP" matches
// "VP Sales" / "SVP" but not "vparthur". Conservative — a senior sender only
// nudges the score (+10 in importance.ts), it never gates anything.
const SENIOR_TITLE =
  /\b(ceo|cfo|cto|coo|cmo|cro|founder|co-?founder|owner|president|s?vp|vice[\s-]?president|head\s+of|chief|director|partner|managing\s+director)\b/i;

/** Sender title denotes exec/lead seniority (drives the "senior sender" factor). */
export function isSeniorTitle(title: string | null | undefined): boolean {
  return title != null && SENIOR_TITLE.test(title);
}

export interface ContactImportance {
  /** The contact has at least one OPEN deal. */
  hasOpenDeal: boolean;
  /** Rank of the most-advanced open deal (undefined when none). */
  dealStageRank?: number;
  /** The contact's title denotes exec/lead seniority. */
  senioritySenior: boolean;
}

/** Derive the inbox-importance enrichment for ONE contact from its deals + title.
 *  Pure — the heart of P1, unit-tested without a DB. */
export function contactImportance(input: {
  deals: Array<{ stage: string | null }>;
  title?: string | null;
}): ContactImportance {
  const open = pickOpenDeal(input.deals);
  return {
    hasOpenDeal: open != null,
    ...(open ? { dealStageRank: open.rank } : {}),
    senioritySenior: isSeniorTitle(input.title),
  };
}
