/**
 * P1-15 — the priority brain of the "Outbound du jour" cockpit. Merges the three
 * things a founder works through each day into one ordered queue:
 *   1. replies (a prospect answered — most time-sensitive)
 *   2. reminders (tasks; overdue before upcoming)
 *   3. drafts to approve (by qualityScore desc, signal-freshness tie-break)
 *
 * Pure + deterministic (now passed in). The endpoint/page render this order; the
 * immersive 3-column UI (modeled on call-mode) and the qualityScore column are
 * the follow-up build.
 */

export type QueueItemKind = "reply" | "reminder" | "draft";

export interface QueueItem {
  kind: QueueItemKind;
  id: string;
  /** drafts — null/undefined → neutral 0.5 sentinel (unscored). */
  qualityScore?: number | null;
  /** drafts — age of the signal the draft leans on; fresher ranks higher. */
  signalFreshnessDays?: number | null;
  /** reminders/replies — ISO due/arrival time. */
  dueAt?: string | null;
}

/** Unscored sentinel — an unscored draft sits at the middle of the draft band. */
export const QUALITY_SENTINEL = 0.5;

export function itemPriority(item: QueueItem, now: Date): number {
  switch (item.kind) {
    case "reply":
      return 1000; // a human replied — always first
    case "reminder": {
      const due = item.dueAt ? new Date(item.dueAt).getTime() : Number.POSITIVE_INFINITY;
      return due <= now.getTime() ? 800 : 600; // overdue before upcoming
    }
    case "draft": {
      const q = item.qualityScore ?? QUALITY_SENTINEL;
      const fresh = item.signalFreshnessDays != null ? Math.max(0, 10 - item.signalFreshnessDays) : 0;
      return 100 + q * 100 + fresh; // 100..210 band, under reminders/replies
    }
    default:
      return 0;
  }
}

/** Order the day's queue: replies → overdue reminders → upcoming reminders →
 *  drafts by quality (fresh signals tie-break). Stable for equal priority. */
export function buildOutboundQueue(items: QueueItem[], now: Date): QueueItem[] {
  return items
    .map((item, idx) => ({ item, idx, p: itemPriority(item, now) }))
    .sort((a, b) => b.p - a.p || a.idx - b.idx)
    .map((x) => x.item);
}

// ── Cockpit assembly (P1-15) ───────────────────────────────────────────────
// The endpoint pulls three raw row-sets; this turns them into render-ready,
// priority-ordered items WITHOUT touching the DB (so it's unit-testable). Each
// enriched item carries the display fields the page needs plus the QueueItem
// fields itemPriority reads. buildOutboundQueue preserves the objects, so the
// extra fields ride through the sort untouched.

export interface QueueDraftRow {
  id: string;
  subject: string | null;
  qualityScore: number | null;
  generatedAt: string | null;
  contactName: string | null;
}
export interface QueueReplyRow {
  id: string;
  contactName: string | null;
  subject: string | null;
  repliedAt: string | null;
  classification: string | null;
}
export interface QueueReminderRow {
  id: string;
  contactName: string | null;
  sequenceName: string | null;
  dueAt: string | null;
}

export interface EnrichedQueueItem extends QueueItem {
  /** Primary line — who/what. */
  title: string;
  /** Secondary line — the context that justifies the rank. */
  subtitle: string;
  /** Where the founder acts on this item. */
  href: string;
}

const UNKNOWN = "Unknown contact";

/** Assemble + order the cockpit queue from the three raw sources. Pure. */
export function assembleOutboundQueue(
  sources: {
    replies: QueueReplyRow[];
    reminders: QueueReminderRow[];
    drafts: QueueDraftRow[];
  },
  now: Date,
): EnrichedQueueItem[] {
  const items: EnrichedQueueItem[] = [];

  for (const r of sources.replies) {
    const who = r.contactName || UNKNOWN;
    items.push({
      kind: "reply",
      id: r.id,
      dueAt: r.repliedAt,
      title: `${who} replied`,
      subtitle: r.classification
        ? `${r.classification} · ${r.subject ?? "(no subject)"}`
        : (r.subject ?? "(no subject)"),
      href: "/inbox",
    });
  }

  for (const r of sources.reminders) {
    const who = r.contactName || UNKNOWN;
    const overdue = r.dueAt ? new Date(r.dueAt).getTime() <= now.getTime() : false;
    items.push({
      kind: "reminder",
      id: r.id,
      dueAt: r.dueAt,
      title: `${overdue ? "Overdue" : "Upcoming"} touch — ${who}`,
      subtitle: r.sequenceName ? `Sequence: ${r.sequenceName}` : "Scheduled sequence step",
      href: "/sequences",
    });
  }

  for (const d of sources.drafts) {
    const who = d.contactName || UNKNOWN;
    items.push({
      kind: "draft",
      id: d.id,
      qualityScore: d.qualityScore,
      title: d.subject || "(no subject)",
      subtitle: `Draft for ${who}`,
      href: "/sequences/review",
    });
  }

  return buildOutboundQueue(items, now) as EnrichedQueueItem[];
}
