/**
 * Contact engagement recency — buckets for the "Dernier contact" filter, the
 * never-contacted / stalled split a call-first rep works from.
 *
 * "Contacted" = a real interaction (email / call / meeting), NEVER CRM
 * bookkeeping — same INTERACTION_ACTIVITY_TYPES SSOT the accounts last-
 * interaction column uses, so the two surfaces can never disagree.
 *
 * Pure + server-safe: the page imports the labels/order, the /api/contacts
 * route embeds recencyBucketSql() for server-side filtering + facet counts
 * (the list paginates, so the bucket must be computed in SQL).
 */

import { INTERACTION_TYPES_SQL_LIST } from "@/lib/accounts/last-interaction";
import type { Locale } from "@/lib/i18n/messages";

/** Non-overlapping buckets, ordered newest → oldest, "never" first. */
export const RECENCY_BUCKETS = ["never", "7", "30", "90", "old"] as const;
export type RecencyBucket = (typeof RECENCY_BUCKETS)[number];

const RECENCY_LABELS: Record<Locale, Record<RecencyBucket, string>> = {
  fr: {
    never: "Jamais contacté",
    "7": "≤ 7 jours",
    "30": "8–30 jours",
    "90": "31–90 jours",
    old: "> 90 jours",
  },
  en: {
    never: "Never contacted",
    "7": "≤ 7 days",
    "30": "8–30 days",
    "90": "31–90 days",
    old: "> 90 days",
  },
};

export function recencyLabel(key: string, locale: Locale = "fr"): string {
  return RECENCY_LABELS[locale][key as RecencyBucket] ?? RECENCY_LABELS.fr[key as RecencyBucket] ?? key;
}

/** Day boundaries that separate the buckets (ascending). Exported so the
 *  account-level recency SQL reuses the exact same edges (one source). */
export const RECENCY_BOUNDARY_DAYS = [7, 30, 90] as const;
const BOUNDARIES: ReadonlyArray<{ key: RecencyBucket; days: number }> =
  RECENCY_BOUNDARY_DAYS.map((days) => ({ key: String(days) as RecencyBucket, days }));

/** Pure TS mirror of recencyBucketSql, for unit tests + single-row consumers. */
export function recencyBucket(
  lastInteraction: Date | string | null | undefined,
  now: Date = new Date(),
): RecencyBucket {
  if (!lastInteraction) return "never";
  const last = lastInteraction instanceof Date ? lastInteraction : new Date(lastInteraction);
  if (Number.isNaN(last.getTime())) return "never";
  const days = (now.getTime() - last.getTime()) / 86_400_000;
  for (const b of BOUNDARIES) if (days <= b.days) return b.key;
  return "old";
}

/**
 * SQL `CASE` → recency bucket for a contact row, from its last real
 * interaction. The correlated subquery matches on `entity_id` (a globally
 * unique contact UUID) and the outer query is tenant-scoped, so no tenant
 * param is needed → the helper is a pure string, generated from BOUNDARIES so
 * the bucket edges can't drift from recencyBucket(). Embed via sql.raw().
 */
export function recencyBucketSql(): string {
  const lastAct = `(SELECT max(a.occurred_at) FROM activities a WHERE a.deleted_at IS NULL AND a.entity_type = 'contact' AND a.entity_id = "contacts"."id" AND a.activity_type IN ${INTERACTION_TYPES_SQL_LIST})`;
  const whens = BOUNDARIES.map(
    (b) => `WHEN ${lastAct} >= now() - interval '${b.days} days' THEN '${b.key}'`,
  ).join("\n    ");
  return `CASE
    WHEN ${lastAct} IS NULL THEN 'never'
    ${whens}
    ELSE 'old'
  END`;
}
