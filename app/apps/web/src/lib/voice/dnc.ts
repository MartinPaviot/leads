/**
 * Do-Not-Call list checks.
 *
 * Two layers: tenant-scoped (added by transcript extraction or manual
 * import) and global (Elevay-wide bans). A number is blocked if it
 * appears in either list.
 */

import { db } from "@/db";
import { doNotCallList } from "@/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

export async function isOnDnc(
  tenantId: string,
  phoneNumber: string,
): Promise<{ blocked: boolean; reason?: string }> {
  const rows = await db
    .select({
      reason: doNotCallList.reason,
      tenantId: doNotCallList.tenantId,
    })
    .from(doNotCallList)
    .where(
      and(
        eq(doNotCallList.phoneNumber, phoneNumber),
        or(eq(doNotCallList.tenantId, tenantId), isNull(doNotCallList.tenantId)),
      ),
    )
    .limit(1);
  if (rows.length === 0) return { blocked: false };
  return { blocked: true, reason: rows[0].reason };
}

export async function batchDncCheck(
  tenantId: string,
  numbers: string[],
): Promise<Set<string>> {
  if (numbers.length === 0) return new Set();
  const rows = await db
    .select({ phoneNumber: doNotCallList.phoneNumber })
    .from(doNotCallList)
    .where(
      and(
        inArray(doNotCallList.phoneNumber, numbers),
        or(eq(doNotCallList.tenantId, tenantId), isNull(doNotCallList.tenantId)),
      ),
    );
  return new Set(rows.map((r) => r.phoneNumber));
}

export async function addToDnc(
  tenantId: string | null,
  phoneNumber: string,
  reason: string,
  source: "manual" | "transcript_extract" | "import" = "manual",
): Promise<void> {
  await db
    .insert(doNotCallList)
    .values({ tenantId, phoneNumber, reason, source })
    .onConflictDoNothing();
}

// Keywords that, when found in a call transcript, automatically add the
// dialed number to the tenant's DNC list. Kept lean — false positives
// here cost real meetings. The classifier in Phase 3 can replace this
// with a proper intent model.
const DNC_PATTERNS = [
  /ne me rappel(?:ez|le|er) plus/i,
  /retir(?:ez|er)[- ](?:moi|mon num[eé]ro)/i,
  /enlev(?:ez|er)[- ]?moi/i,
  /pas (?:m'?)?int[eé]ress[ée]/i,
  /\bremove me\b/i,
  /\bdo not call (?:me|us)\b/i,
  /\btake me off (?:your )?list\b/i,
  /\bstop calling (?:me|us)\b/i,
  /\bopt[- ]out\b/i,
];

export function detectDncRequest(transcript: string): boolean {
  return DNC_PATTERNS.some((re) => re.test(transcript));
}
