/**
 * Spec 36 (P0) — resolve which seat a LinkedIn sequence step sends from.
 *
 * Mirrors the email "personal sequence -> creator's mailbox" precedent
 * (sequence-draft-to-outbound.ts:328-353, outbound.ts:44-47): a step's owner is
 * the sequence creator (sequences.createdBy, auth-space id), and we send from
 * THAT user's connected seat. The ONE difference from email: there is NO pool
 * fallback — every LinkedIn action is tied to one human's login, so a missing
 * seat means skip/queue+notify, NEVER borrow a teammate's seat. The resolver is
 * structurally incapable of selecting another user's seat (it only ever filters
 * userId = ownerId).
 *
 * The classifier is pure + unit-tested; the two DB lookups are thin glue.
 */

import { db as defaultDb } from "@/db";
import { sequences, linkedinAccount } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { DispatchSeat } from "./dispatch";
import type { LinkedInAccountStatus } from "./capacity";

/** The seat columns the resolver reads. */
export interface SeatRow {
  id: string;
  unipileAccountId: string | null;
  status: string;
  dailyCapConnect: number;
  dailyCapMessage: number;
  warmupStartedAt: Date | null;
}

export type SeatResolution =
  | { ok: true; ownerId: string; seat: DispatchSeat }
  | { ok: false; reason: "no-owner" | "no-connected-seat"; ownerId?: string };

/**
 * Decide the seat outcome from the step owner + their seat row. Pure.
 * - no owner (legacy/agent-created sequence, createdBy null) -> no-owner
 *   (NO neutral system LinkedIn sender exists; caller skips + notifies admin).
 * - owner with no connected seat -> no-connected-seat (caller queues + notifies
 *   the owner to connect/reconnect).
 */
export function classifySeatResolution(ownerId: string | null | undefined, row: SeatRow | null): SeatResolution {
  if (!ownerId) return { ok: false, reason: "no-owner" };
  if (!row || row.status !== "connected" || !row.unipileAccountId) {
    return { ok: false, reason: "no-connected-seat", ownerId };
  }
  return {
    ok: true,
    ownerId,
    seat: {
      id: row.id,
      unipileAccountId: row.unipileAccountId,
      status: row.status as LinkedInAccountStatus,
      dailyCapConnect: row.dailyCapConnect,
      dailyCapMessage: row.dailyCapMessage,
      warmupStartedAt: row.warmupStartedAt,
    },
  };
}

/**
 * Resolve the sending seat for a sequence step: step -> sequence.createdBy ->
 * that user's CONNECTED seat. Tenant-scoped. `database` is injectable for tests.
 */
export async function resolveLinkedInSeatForStep(
  tenantId: string,
  sequenceId: string,
  database: typeof defaultDb = defaultDb,
): Promise<SeatResolution> {
  const [seq] = await database
    .select({ createdBy: sequences.createdBy })
    .from(sequences)
    .where(and(eq(sequences.id, sequenceId), eq(sequences.tenantId, tenantId)))
    .limit(1);

  const ownerId = seq?.createdBy ?? null;
  if (!ownerId) return classifySeatResolution(null, null);

  // Only ever the OWNER's seat — never a pool, never a colleague's.
  const [row] = await database
    .select({
      id: linkedinAccount.id,
      unipileAccountId: linkedinAccount.unipileAccountId,
      status: linkedinAccount.status,
      dailyCapConnect: linkedinAccount.dailyCapConnect,
      dailyCapMessage: linkedinAccount.dailyCapMessage,
      warmupStartedAt: linkedinAccount.warmupStartedAt,
    })
    .from(linkedinAccount)
    .where(
      and(
        eq(linkedinAccount.tenantId, tenantId),
        eq(linkedinAccount.userId, ownerId),
        eq(linkedinAccount.status, "connected"),
      ),
    )
    .limit(1);

  return classifySeatResolution(ownerId, row ?? null);
}
