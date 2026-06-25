/**
 * SQL mirror of `isExcludedAsLead` (lib/inbound/lead-status.ts) for use inside
 * Drizzle WHERE clauses — so aggregate/count queries can exclude non-prospect
 * contacts at the database without fetching every row to filter in JS.
 *
 * Returns a boolean SQL fragment that is TRUE when the contact is NOT excluded
 * as a lead, matching the JS precedence exactly:
 *   - human verdict wins:      leadFeedback.isLead === false → excluded (false)
 *                              leadFeedback.isLead === true  → included (true)
 *   - else the LLM verdict:     leadRelationship.isInboundLead === false → excluded
 *   - else (unjudged / empty):  included (true)
 *
 * Null-safe: a contact with NULL/empty `properties` (the common case) evaluates
 * to TRUE (included) via the COALESCE wrapper, so a LEFT JOIN that resolves no
 * contact does not silently drop legitimate prospect sends. Pair it with
 * `isNotNull(<table>.contactId)` to drop contact-less plumbing/self-test rows.
 *
 * Used by every founder-facing metric built on outbound_emails / contact-scoped
 * activities (dashboard summary KPIs, deliverability, campaign rollups, hot-to-
 * call, SLA alerts) so they all count PROSPECT activity, not noise. See the
 * home-dashboard fix (commit 624f1f20) this generalizes.
 */
import { sql, type AnyColumn, type SQL } from "drizzle-orm";

export function notExcludedAsLeadSql(properties: AnyColumn): SQL<boolean> {
  return sql<boolean>`COALESCE(CASE
    WHEN (${properties} -> 'leadFeedback' ->> 'isLead') = 'false' THEN false
    WHEN (${properties} -> 'leadFeedback' ->> 'isLead') = 'true'  THEN true
    WHEN (${properties} -> 'leadRelationship' ->> 'isInboundLead') = 'false' THEN false
    ELSE true END, true)`;
}
