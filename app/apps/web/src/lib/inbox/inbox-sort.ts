/**
 * Inbox sort modes (the email-client sort control). Pure + unit-tested.
 *
 * The conversation list is paginated server-side, so the sort MUST run on the
 * full filtered set before slicing — sorting only the visible page would be a
 * lie. This module is the single source of truth for the comparators; the route
 * wires it, the header `_sort-menu` lists it.
 *
 * Default is `date` (newest received first) — a real Inbox is a chronological
 * folder, not a triage queue. `priority` keeps the explainable importance
 * ranking (INBOX-T04) for anyone who wants the AI to float hot threads up, and
 * unlike the legacy attention-only sort it applies the importance order across
 * every row (so a Primary view that mixes attention + handled stays consistent).
 */

export type InboxSort = "date" | "date-asc" | "priority" | "unread" | "sender";

/** Display order + labels for the sort menu. English to match the inbox chrome. */
export const INBOX_SORTS: ReadonlyArray<{ id: InboxSort; label: string }> = [
  { id: "date", label: "Date (newest)" },
  { id: "date-asc", label: "Date (oldest)" },
  { id: "priority", label: "Priority" },
  { id: "unread", label: "Unread first" },
  { id: "sender", label: "Sender" },
];

const SORT_IDS = new Set<string>(INBOX_SORTS.map((s) => s.id));

export function isInboxSort(v: string | null | undefined): v is InboxSort {
  return v != null && SORT_IDS.has(v);
}

/**
 * The sort a view falls back to when the caller sends no explicit `?sort=`.
 * Triage surfaces (the attention lane + its intention splits) rank by priority;
 * every email-client folder (Inbox/Primary, Done, Snoozed, Handled, All Mail,
 * Starred, Trash, Spam) is chronological. The UI always sends an explicit sort,
 * so this only governs direct/other API callers.
 */
export function defaultInboxSort(laneParam: string, hasSplit: boolean): InboxSort {
  return laneParam === "attention" || hasSplit ? "priority" : "date";
}

/** The minimal per-conversation fields the comparators read. */
export interface SortFields {
  importanceTier: number;
  importanceScore: number;
  followupOverdue: boolean;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  unread: boolean;
  /** Lowercased display name (contact name, else from-address) for `sender`. */
  sortName: string;
}

function dateMs(f: SortFields): number {
  const v = f.lastInboundAt ?? f.lastMessageAt;
  if (!v) return 0;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Ascending by received time (older first). */
function cmpDateAsc(a: SortFields, b: SortFields): number {
  return dateMs(a) - dateMs(b);
}

/** Importance order (tier, finer score, overdue follow-up), newest as the tie-break. */
function cmpPriority(a: SortFields, b: SortFields): number {
  if (a.importanceTier !== b.importanceTier) return a.importanceTier - b.importanceTier;
  if (a.importanceScore !== b.importanceScore) return b.importanceScore - a.importanceScore;
  const ao = a.followupOverdue ? 1 : 0;
  const bo = b.followupOverdue ? 1 : 0;
  if (ao !== bo) return bo - ao;
  return cmpDateAsc(b, a); // newest first within equal priority
}

export function compareBy(mode: InboxSort, a: SortFields, b: SortFields): number {
  switch (mode) {
    case "date":
      return cmpDateAsc(b, a); // newest first
    case "date-asc":
      return cmpDateAsc(a, b); // oldest first
    case "unread": {
      if (a.unread !== b.unread) return a.unread ? -1 : 1; // unread leads
      return cmpDateAsc(b, a); // then newest first
    }
    case "sender": {
      const c = a.sortName.localeCompare(b.sortName, undefined, { sensitivity: "base" });
      if (c !== 0) return c;
      return cmpDateAsc(b, a); // same sender → newest first
    }
    case "priority":
    default:
      return cmpPriority(a, b);
  }
}

/** Stable-by-input sort of arbitrary rows via a field extractor (pure — copies). */
export function sortRows<T>(rows: T[], mode: InboxSort, fieldsOf: (r: T) => SortFields): T[] {
  return [...rows].sort((x, y) => compareBy(mode, fieldsOf(x), fieldsOf(y)));
}
