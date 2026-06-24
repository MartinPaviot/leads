/**
 * Spec 17 — read a contact's email verification status for the live pre-send
 * gate. SAFE rollout: the gate blocks only KNOWN-invalid recipients; NULL
 * (not yet verified), valid, risky, catch_all, and unknown all pass. The strict
 * "valid-only" rule (AC2) becomes correct once the verification job has run and
 * populated `contacts.email_status` for the audience — until then, blocking on
 * NULL would halt every send.
 */

import { db as defaultDb } from "@/db";
import { contacts } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

/** Statuses we will NOT send to. Only the explicit terminal-bad one for now. */
const KNOWN_UNSENDABLE = new Set(["invalid"]);

/** True iff the status is a known-bad terminal status. NULL/unknown/valid/risky/catch_all → false. */
export function isEmailKnownUnsendable(status: string | null | undefined): boolean {
  return status != null && KNOWN_UNSENDABLE.has(status);
}

/** Load the (most relevant) contact's email_status for a tenant+address, or null. Injectable for tests. */
export async function loadEmailStatus(
  tenantId: string,
  email: string,
  database: typeof defaultDb = defaultDb,
): Promise<string | null> {
  const e = email.trim().toLowerCase();
  const rows = await database
    .select({ s: contacts.emailStatus })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), sql`lower(${contacts.email}) = ${e}`))
    .limit(1);
  return rows[0]?.s ?? null;
}
