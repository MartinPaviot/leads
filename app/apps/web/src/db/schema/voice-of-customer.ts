/**
 * Schema for Sprint-3 audit follow-up — voice-of-customer capture.
 *
 * `customer_requests` is the queue an FDAE (Forward-Deployed AE)
 * would maintain : every "I wish you would do X" pattern in any
 * customer conversation, classified, deduplicated by canonical
 * phrasing, ARR-weighted for prioritisation. The classifier in
 * `lib/voice-of-customer/classifier.ts` decides what becomes a
 * row ; this table stores the result.
 *
 * Quarterly Customer Council reads this aggregated.
 */

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";

export const customerRequests = pgTable(
  "customer_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    /** What kind of request — "feature_request" | "bug_report" |
     *  "integration_ask" | "ux_friction" | "doc_gap" | "expansion_intent". */
    kind: text("kind").notNull(),
    /** Verbatim from the user. Trim to 2000 chars on insert. */
    verbatim: text("verbatim").notNull(),
    /** Surface where the request surfaced — "chat" | "support" |
     *  "onboarding_feedback" | "in_product_widget". */
    source: text("source").notNull(),
    /** Optional canonical-phrasing key — used for deduplication
     *  across requests that mean the same thing. e.g.
     *  "linkedin-export" or "salesforce-bidir-sync". */
    canonicalKey: text("canonical_key"),
    /** Tenant-level estimated ARR — copied at write time so the
     *  Customer Council can sort without a join. Optional. */
    tenantArrUsd: doublePrecision("tenant_arr_usd"),
    /** "open" | "triaging" | "planned" | "in_progress" | "shipped" |
     *  "wont_do". Defaults to "open". */
    status: text("status").notNull().default("open"),
    /** Free-form metadata — dealId, accountId, contact name, etc. */
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** Timestamp when the request lifecycle column was last touched
     *  (status change, ARR refresh, dedupe merge). */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("customer_requests_tenant_idx").on(table.tenantId),
    index("customer_requests_status_idx").on(table.status),
    index("customer_requests_canonical_idx").on(table.canonicalKey),
    index("customer_requests_created_at_idx").on(table.createdAt),
  ],
);
