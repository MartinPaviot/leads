/**
 * Account segment SQL — the two cuts a call-first GTM rep works the book by,
 * neither of which has a column to hang on:
 *
 *  - contact reach: does the account have a contact at all, and is one of them
 *    actually dialable? (Sans contact → needs sourcing; contact sans numéro →
 *    needs phone enrichment; contact joignable → call-ready.)
 *  - engagement recency: when was the last REAL interaction across the account's
 *    contacts, itself and its deals — the never-contacted / stalled split.
 *
 * Pure strings (no bound params: ids are globally-unique UUIDs and the outer
 * query is tenant-scoped), generated so the recency edges stay shared with the
 * contact-level recency. Embed via sql.raw(), like EFFECTIVE_LIFECYCLE_STAGE_SQL.
 */

import { INTERACTION_TYPES_SQL_LIST } from "./last-interaction";
import { RECENCY_BOUNDARY_DAYS } from "@/lib/contacts/recency";
import type { Locale } from "@/lib/i18n/messages";

// ── Contact reach ────────────────────────────────────────────────────
export const ACCOUNT_REACH_BUCKETS = ["reachable", "no_phone", "none"] as const;
export type AccountReachBucket = (typeof ACCOUNT_REACH_BUCKETS)[number];

const REACH_LABELS: Record<Locale, Record<AccountReachBucket, string>> = {
  fr: {
    reachable: "Contact joignable",
    no_phone: "Contact, sans numéro",
    none: "Sans contact",
  },
  en: {
    reachable: "Reachable contact",
    no_phone: "Contact, no number",
    none: "No contact",
  },
};

export function accountReachLabel(key: string, locale: Locale = "fr"): string {
  return REACH_LABELS[locale][key as AccountReachBucket] ?? REACH_LABELS.fr[key as AccountReachBucket] ?? key;
}

/** SQL CASE → contact-reach bucket for a "companies" row. EXISTS over the
 *  indexed contacts.company_id; no tenant param needed (company id is unique,
 *  outer query tenant-scoped). */
export function accountContactReachSql(): string {
  const base = `FROM contacts c WHERE c.company_id = "companies"."id" AND c.deleted_at IS NULL`;
  return `CASE
    WHEN NOT EXISTS (SELECT 1 ${base}) THEN 'none'
    WHEN EXISTS (SELECT 1 ${base} AND c.phone IS NOT NULL AND btrim(c.phone) <> '') THEN 'reachable'
    ELSE 'no_phone'
  END`;
}

// ── Engagement recency (account-level) ───────────────────────────────
/** SQL CASE → recency bucket (never / 7 / 30 / 90 / old) for a "companies"
 *  row, from the last real interaction across its contacts, itself and its
 *  deals — the same 3 sources + INTERACTION types as lib/accounts/last-
 *  interaction, and the same day edges as the contact-level recency. */
export function accountRecencyBucketSql(): string {
  const types = INTERACTION_TYPES_SQL_LIST;
  const lastAct = `(SELECT max(u.occurred_at) FROM (
      SELECT a.occurred_at FROM activities a
        JOIN contacts c ON c.id = a.entity_id AND a.entity_type = 'contact' AND c.deleted_at IS NULL
        WHERE a.deleted_at IS NULL AND c.company_id = "companies"."id" AND a.activity_type IN ${types}
      UNION ALL
      SELECT a.occurred_at FROM activities a
        WHERE a.deleted_at IS NULL AND a.entity_type = 'company' AND a.entity_id = "companies"."id" AND a.activity_type IN ${types}
      UNION ALL
      SELECT a.occurred_at FROM activities a
        JOIN deals d ON d.id = a.entity_id AND a.entity_type = 'deal' AND d.deleted_at IS NULL
        WHERE a.deleted_at IS NULL AND d.company_id = "companies"."id" AND a.activity_type IN ${types}
    ) u)`;
  const whens = RECENCY_BOUNDARY_DAYS.map(
    (d) => `WHEN ${lastAct} >= now() - interval '${d} days' THEN '${d}'`,
  ).join("\n    ");
  return `CASE
    WHEN ${lastAct} IS NULL THEN 'never'
    ${whens}
    ELSE 'old'
  END`;
}
