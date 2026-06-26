/**
 * Inbox view resolution — pure + unit-tested.
 *
 * Maps the UI's (lane, split, mailbox, search) into the server `effLane`/`split`
 * query params AND the client lane-cache key. Extracted from the page so the
 * primary-view mapping and the cache key are testable in isolation: a wrong
 * `cacheKey` would paint one lane's cached rows under another lane — a silent,
 * serious content bug — so it earns its own tests.
 */

export interface InboxViewInput {
  /** The requested lane param: attention | snoozed | done | handled | starred |
   *  drafts | scheduled | all | trash | spam | a custom-lane UUID. */
  lane: string;
  /** Active intention split (needs_reply | follow_ups | promotions | social |
   *  other | noise | a custom-split UUID), or null. */
  activeSplit: string | null;
  /** Focused mailbox id in the unified inbox, or null for all. */
  selectedMailbox: string | null;
  /** The active (debounced) search query. */
  search: string;
}

export interface InboxView {
  /** Lane to send to the route: attention → `primary` for the Inbox/Primary view. */
  effLane: string;
  /** Split to send (`&split=`), or "" when the view isn't sub-segmented. */
  splitId: string;
  /** Client lane-cache key: `effLane | mailbox | split`. */
  cacheKey: string;
  /** Whether this view may be cached. Search views are transient → never cached. */
  canCache: boolean;
}

export function resolveInboxView(i: InboxViewInput): InboxView {
  // Inbox/Primary is the email-client primary view: the bare attention lane, and
  // its "Primary"/"other" split, both show all primary-category mail (lane=primary),
  // not the triage attention subset (Upstream model). Any OTHER split on the
  // attention lane is a real sub-segment.
  const isPrimaryView = i.lane === "attention" && (!i.activeSplit || i.activeSplit === "other");
  const effLane = isPrimaryView ? "primary" : i.lane;
  const splitId = i.activeSplit && i.lane === "attention" && !isPrimaryView ? i.activeSplit : "";
  const canCache = i.search.length === 0;
  const cacheKey = `${effLane}|${i.selectedMailbox ?? ""}|${splitId}`;
  return { effLane, splitId, cacheKey, canCache };
}
