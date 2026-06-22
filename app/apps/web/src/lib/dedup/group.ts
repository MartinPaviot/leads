/**
 * Account grouping (spec 07, AC1) + the fuzzy near-match review pass (AC4). Pure.
 */
import { similarity } from "./similarity";
import type { DedupAccount, ReviewGroup } from "./types";

/** Group accounts by identity key (canonicalIdentityKey: legal_id → domain →
 *  name). Unkeyed accounts are excluded (they can only be review candidates). */
export function groupByIdentity(accounts: DedupAccount[]): Map<string, DedupAccount[]> {
  const m = new Map<string, DedupAccount[]>();
  for (const a of accounts) {
    if (!a.identityKey) continue;
    const arr = m.get(a.identityKey) ?? [];
    arr.push(a);
    m.set(a.identityKey, arr);
  }
  return m;
}

/**
 * Cross-key near-matches: accounts with DIFFERENT identity keys but a normalized
 * name at/above the threshold are ambiguous (same name, different domain/legal
 * id) — flag for review, never guess-merge (AC4). Deterministic + symmetric.
 */
export function findReviewCandidates(accounts: DedupAccount[], threshold: number): ReviewGroup[] {
  const named = accounts.filter((a) => a.normalizedName && a.normalizedName.length >= 3);
  const reviews: ReviewGroup[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const a = named[i];
      const b = named[j];
      if (a.identityKey && b.identityKey && a.identityKey === b.identityKey) continue; // same key → merged, not review
      const score = similarity(a.normalizedName!, b.normalizedName!);
      if (score >= threshold) {
        const pairKey = [a.id, b.id].sort().join("|");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        reviews.push({ reason: `name similarity ${score.toFixed(2)} across distinct identity keys`, ids: [a.id, b.id].sort(), score });
      }
    }
  }
  return reviews;
}
