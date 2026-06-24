/**
 * Spec 35 — targeting_status resolution for the send gate.
 *
 * targeting_status is the reversible "do we want to contact this account now?"
 * axis (unreviewed | targeted | archived), distinct from suppression (consent).
 * Under SAFE_MODE the gate allows only `targeted` accounts (default-deny), so
 * resolution is FAIL-CLOSED: any miss returns 'unreviewed' ⇒ the gate denies.
 */

import { db as defaultDb } from "@/db";
import { companies, contacts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type TargetingStatus = "unreviewed" | "targeted" | "archived";

/**
 * Resolve an account's targeting_status. Prefers an explicit companyId; falls
 * back to contactId → contacts.companyId. Returns 'unreviewed' (deny under
 * SAFE_MODE) on any unresolved account or lookup error.
 */
export async function loadTargetingStatus(
  tenantId: string,
  companyId?: string | null,
  contactId?: string | null,
  database: typeof defaultDb = defaultDb,
): Promise<TargetingStatus> {
  try {
    let cid = companyId ?? null;
    if (!cid && contactId) {
      const [c] = await database
        .select({ companyId: contacts.companyId })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
        .limit(1);
      cid = c?.companyId ?? null;
    }
    if (!cid) return "unreviewed";
    const [row] = await database
      .select({ ts: companies.targetingStatus })
      .from(companies)
      .where(and(eq(companies.tenantId, tenantId), eq(companies.id, cid)))
      .limit(1);
    return (row?.ts as TargetingStatus | undefined) ?? "unreviewed";
  } catch {
    return "unreviewed";
  }
}

/**
 * One-read gate context for `evaluateSend`: resolves BOTH the account's
 * targeting_status and its suppression account-key (canonical identity_key,
 * falling back to companyId when identity_key is null — design residual risk 5)
 * from a single company row. Fail-closed: returns { unreviewed, null } on any
 * miss so the gate denies (targeting) and skips account-scope suppression
 * (email/domain still apply).
 */
export async function loadAccountGateContext(
  tenantId: string,
  companyId?: string | null,
  contactId?: string | null,
  database: typeof defaultDb = defaultDb,
): Promise<{ targetingStatus: TargetingStatus; accountKey: string | null }> {
  try {
    let cid = companyId ?? null;
    if (!cid && contactId) {
      const [c] = await database
        .select({ companyId: contacts.companyId })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
        .limit(1);
      cid = c?.companyId ?? null;
    }
    if (!cid) return { targetingStatus: "unreviewed", accountKey: null };
    const [row] = await database
      .select({ ts: companies.targetingStatus, ik: companies.identityKey })
      .from(companies)
      .where(and(eq(companies.tenantId, tenantId), eq(companies.id, cid)))
      .limit(1);
    if (!row) return { targetingStatus: "unreviewed", accountKey: null };
    return { targetingStatus: (row.ts as TargetingStatus) ?? "unreviewed", accountKey: row.ik ?? cid };
  } catch {
    return { targetingStatus: "unreviewed", accountKey: null };
  }
}

/**
 * D5 dual-write: the targeting_status implied by the legacy exclude/delete flags,
 * so callers keep the new column in lockstep with excludedReason/deletedAt during
 * the transition. excluded OR soft-deleted ⇒ archived; otherwise targeted.
 */
export function targetingStatusForLegacy(input: {
  excludedReason?: string | null;
  deletedAt?: Date | string | null;
}): TargetingStatus {
  return input.deletedAt || input.excludedReason ? "archived" : "targeted";
}
