/**
 * dedupeRun (spec 07) — the run-level cross-provider collapse. Pure over a
 * loaded set; the DB load + provenance re-point is the caller's concern (the
 * MergedGroup tells it which losers' field_source rows to re-point to the
 * survivor, then recompute). Idempotent: re-running over an already-collapsed
 * set yields singleton groups → {merged:0} (AC5).
 */
import { groupByIdentity, findReviewCandidates } from "./group";
import { collapseGroup } from "./merge";
import { dedupeContacts } from "./contacts";
import type { DedupAccount, DedupContact, DedupOptions, MergeReport, PickWinner } from "./types";

export interface DedupDeps {
  /** spec-00 provider-precedence resolver, injected. */
  pickWinner: PickWinner;
}

export function dedupeRun(
  accounts: DedupAccount[],
  contacts: DedupContact[],
  deps: DedupDeps,
  opts: DedupOptions = {},
): MergeReport {
  const reviewThreshold = opts.reviewThreshold ?? 0.85;

  const groups = groupByIdentity(accounts);
  const mergedGroups = [];
  let merged = 0;
  for (const [key, members] of groups) {
    if (members.length > 1) {
      const g = collapseGroup(key, members, deps.pickWinner);
      mergedGroups.push(g);
      merged += g.absorbedIds.length;
    }
  }

  const unkeyed = accounts.filter((a) => !a.identityKey).length;
  const kept = groups.size + unkeyed; // one survivor per key + each unkeyed record

  const reviews = findReviewCandidates(accounts, reviewThreshold);
  const reviewed = new Set(reviews.flatMap((r) => r.ids)).size;

  const contactGroups = dedupeContacts(contacts);

  return { merged, reviewed, kept, groups: mergedGroups, reviews, contactGroups };
}
