/**
 * P0-5 — tenant suppression-list lookup, backed by the existing `emailOptouts`
 * table (hard bounce / complaint / opt-out all land there). One shared helper so
 * the 6 enrollment entry points don't each grow a divergent ad-hoc query.
 * Case-insensitive (lower()) on both sides to absorb historically mixed-case rows.
 */

import { db } from "@/db";
import { emailOptouts } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

/** Lower-cased subset of `emails` that are suppressed for this tenant. */
export async function loadSuppressedEmails(
  tenantId: string,
  emails: (string | null | undefined)[],
): Promise<Set<string>> {
  const lowered = [...new Set(emails.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  if (lowered.length === 0) return new Set();
  const rows = await db
    .select({ email: emailOptouts.emailAddress })
    .from(emailOptouts)
    .where(and(eq(emailOptouts.tenantId, tenantId), inArray(sql`lower(${emailOptouts.emailAddress})`, lowered)));
  return new Set(rows.map((r) => r.email.toLowerCase()));
}

/** True if this single address is on the tenant's suppression-list. */
export async function isEmailSuppressed(tenantId: string, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  return (await loadSuppressedEmails(tenantId, [email])).size > 0;
}
