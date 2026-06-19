/**
 * Apply a parsed search query (INBOX-Q04) to a conversation. Pure + unit-tested.
 *
 * parseSearchQuery turns the raw string into operators; this is the deterministic
 * matcher the conversations route runs over the already-scoped set. `has:` (e.g.
 * attachment) is intentionally ignored — attachments aren't captured (see R04
 * ocean) — so it never excludes rather than lying about a match.
 */

import { parseSearchQuery, type ParsedQuery } from "./search-query";

export interface SearchCandidate {
  from: string;
  subject: string;
  snippet: string;
  lane: string; // attention | handled | snoozed | done
  at: string | null; // lastMessageAt (ISO)
  mailbox?: string | null;
}

function incl(hay: string | null | undefined, needle: string): boolean {
  return (hay ?? "").toLowerCase().includes(needle.toLowerCase());
}

function asTime(s: string | undefined): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

// "is:" tags that map onto a lane. "unread" ≈ the needs-attention lane.
const LANE_FOR_IS: Record<string, string> = {
  unread: "attention",
  attention: "attention",
  done: "done",
  snoozed: "snoozed",
  handled: "handled",
};

export function matchesSearch(c: SearchCandidate, q: ParsedQuery): boolean {
  if (q.from && !incl(c.from, q.from)) return false;
  if (q.to && !incl(c.mailbox, q.to)) return false;
  if (q.subject && !incl(c.subject, q.subject)) return false;

  const at = asTime(c.at ?? undefined);
  const before = asTime(q.before); // unparseable operator value ⇒ ignored, never excludes
  const after = asTime(q.after);
  if (before != null && !(at != null && at < before)) return false;
  if (after != null && !(at != null && at > after)) return false;

  if (q.is) {
    for (const tag of q.is) {
      const lane = LANE_FOR_IS[tag];
      if (lane && c.lane !== lane) return false;
    }
  }

  if (q.text) {
    if (!(incl(c.subject, q.text) || incl(c.snippet, q.text) || incl(c.from, q.text))) return false;
  }
  return true;
}

/** True when the query carries any operator or free text worth filtering on. */
export function isActiveQuery(q: ParsedQuery): boolean {
  return Boolean(
    q.text || q.from || q.to || q.subject || q.before || q.after || q.is?.length || q.has?.length,
  );
}

export { parseSearchQuery };
