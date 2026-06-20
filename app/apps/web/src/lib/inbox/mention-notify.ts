/**
 * Mention notification targeting (B8, INBOX-X02). The @mention PARSER
 * (mentions.ts) and the notification preference model (notification-prefs.ts) both
 * already exist but were never connected — a parsed mention notified no one. This
 * pure resolver is the bridge: given a parse result, the comment author, and a
 * per-user "is the mention event on" predicate, it returns the distinct set of
 * user ids to notify — never the author, never an opted-out member.
 */

import type { MentionResult } from "./mentions";

/**
 * Resolve who to notify for a parsed comment. Distinct mentioned ids, minus the
 * author (you never get pinged for mentioning yourself), minus anyone whose
 * `mention` notification is off. Unknown handles were already excluded by the
 * parser. `isMentionEnabled(userId)` is the per-user gate (defaults to notify when
 * the caller has no preference loaded).
 */
export function resolveMentionTargets(
  parsed: Pick<MentionResult, "mentioned">,
  authorId: string,
  isMentionEnabled: (userId: string) => boolean,
): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const m of parsed.mentioned) {
    if (m.id === authorId) continue; // never self-notify
    if (seen.has(m.id)) continue; // distinct (parser dedupes, but be safe)
    seen.add(m.id);
    if (!isMentionEnabled(m.id)) continue; // respect the per-user mention pref
    targets.push(m.id);
  }
  return targets;
}
