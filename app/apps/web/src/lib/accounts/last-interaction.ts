/**
 * "Last interaction" for an account — single source of truth.
 *
 * An interaction is a real exchange with the prospect (email, call, meeting),
 * NEVER CRM bookkeeping: logAudit writes `system_event` rows attached to
 * contacts ("User deleted contact", restore, merge…) into the same activities
 * table, and an unfiltered query would surface those as the account's "last
 * interaction".
 *
 * Sources, unioned per account:
 *  - activities attached to the account's live contacts (the common case)
 *  - activities attached to the company itself (e.g. inbound from a known
 *    company domain whose contact wasn't auto-created)
 *  - activities attached to the account's live deals (e.g. meetings logged
 *    on the opportunity)
 */

export const INTERACTION_ACTIVITY_TYPES = [
  "email_sent",
  "email_received",
  "email_replied",
  "call_completed",
  "meeting_scheduled",
  "meeting_completed",
] as const;

/** SQL list literal — embeds via sql.raw, no bound params. */
export const INTERACTION_TYPES_SQL_LIST = `(${INTERACTION_ACTIVITY_TYPES.map((t) => `'${t}'`).join(", ")})`;

/**
 * Param-free body of the per-account last-interaction query. The caller
 * supplies `$ids` (text[] of company ids) and `$tenant` by interpolating
 * bound params around it — see /api/accounts. Kept as a string so tests can
 * assert the shape (type filter, deleted_at guards, all three sources).
 */
export function lastInteractionUnionSql(opts: { idsParam: string; tenantParam: string }): string {
  const { idsParam, tenantParam } = opts;
  const types = INTERACTION_TYPES_SQL_LIST;
  return `
    SELECT DISTINCT ON (u.company_id) u.company_id, u.occurred_at, u.summary
    FROM (
      SELECT c.company_id, a.occurred_at, a.summary
      FROM activities a
      JOIN contacts c ON c.id = a.entity_id AND a.entity_type = 'contact' AND c.deleted_at IS NULL
      WHERE a.tenant_id = ${tenantParam} AND a.deleted_at IS NULL AND c.tenant_id = ${tenantParam}
        AND c.company_id = ANY(${idsParam})
        AND a.activity_type IN ${types}
      UNION ALL
      SELECT a.entity_id AS company_id, a.occurred_at, a.summary
      FROM activities a
      WHERE a.tenant_id = ${tenantParam} AND a.deleted_at IS NULL AND a.entity_type = 'company'
        AND a.entity_id = ANY(${idsParam})
        AND a.activity_type IN ${types}
      UNION ALL
      SELECT d.company_id, a.occurred_at, a.summary
      FROM activities a
      JOIN deals d ON d.id = a.entity_id AND a.entity_type = 'deal' AND d.deleted_at IS NULL
      WHERE a.tenant_id = ${tenantParam} AND a.deleted_at IS NULL AND d.tenant_id = ${tenantParam}
        AND d.company_id = ANY(${idsParam})
        AND a.activity_type IN ${types}
    ) u
    ORDER BY u.company_id, u.occurred_at DESC NULLS LAST`;
}
