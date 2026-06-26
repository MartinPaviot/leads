/**
 * AUTOPILOT-AUTOPAUSE (P0 #1) — the decision + effecting layer.
 *
 *  - `decideAutoPauseActions` is PURE: given the per-sequence health, the mode,
 *    and thresholds, it returns what to do (pause / notify / none). All the
 *    off/shadow/enforce branching lives here so it's unit-testable with no IO.
 *  - `pauseSequence` is the thin, guarded UPDATE (tenant-scoped, only flips an
 *    'active', non-protected sequence → idempotent: a second call is a no-op).
 *  - `notifyPaused` writes a notification to the tenant owner (mirrors
 *    inngest/deliverability-monitor.ts).
 */

import { and, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { sequences, notifications, users } from "@/db/schema";
import type { AutoPauseMode } from "./flag";
import {
  classifySequence,
  DEFAULT_THRESHOLDS,
  type AutoPauseThresholds,
  type SequenceHealth,
  type Verdict,
} from "./sequence-health";

export interface AutoPauseAction {
  sequenceId: string;
  name: string;
  action: "pause" | "notify" | "none";
  verdict: Verdict;
  reason: string;
}

/**
 * PURE. Maps each sequence's health → an action under the given mode:
 *   dead + enforce → pause;  dead + shadow → notify;  dead + off → none;
 *   anything not "dead" (healthy / insufficient_data / protected) → none.
 */
export function decideAutoPauseActions(
  healths: SequenceHealth[],
  mode: AutoPauseMode,
  thresholds: AutoPauseThresholds = DEFAULT_THRESHOLDS
): AutoPauseAction[] {
  return healths.map((h) => {
    const c = classifySequence(h, thresholds);
    let action: AutoPauseAction["action"] = "none";
    if (c.verdict === "dead") {
      if (mode === "enforce") action = "pause";
      else if (mode === "shadow") action = "notify";
    }
    return { sequenceId: h.sequenceId, name: h.name, action, verdict: c.verdict, reason: c.reason };
  });
}

type Database = typeof defaultDb;

/**
 * Flip a dead sequence to 'paused', recording why/who. Guard clauses make this
 * safe + idempotent: tenant-scoped, only an 'active' and non-protected sequence
 * is touched. Returns true iff a row actually changed (false ⇒ already
 * paused/protected/cross-tenant ⇒ no-op, so the caller skips the notification).
 */
export async function pauseSequence(
  tenantId: string,
  sequenceId: string,
  reason: string,
  opts: { db?: Database } = {}
): Promise<boolean> {
  const db = opts.db ?? defaultDb;
  const updated = await db
    .update(sequences)
    .set({
      status: "paused",
      pausedReason: reason,
      pausedBy: "autopilot",
      pausedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sequences.id, sequenceId),
        eq(sequences.tenantId, tenantId),
        eq(sequences.status, "active"),
        eq(sequences.autopilotProtected, false)
      )
    )
    .returning({ id: sequences.id });
  return updated.length > 0;
}

/** Notify the tenant owner that a sequence was auto-paused (or, in shadow, flagged). */
export async function notifyPaused(
  tenantId: string,
  sequenceId: string,
  sequenceName: string,
  reason: string,
  opts: { db?: Database } = {}
): Promise<void> {
  const db = opts.db ?? defaultDb;
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .limit(1);
  if (!owner) return;
  await db.insert(notifications).values({
    tenantId,
    userId: owner.id,
    type: "system" as never, // matches deliverability-monitor's cast; 'system' is a runtime value
    title: `Sequence auto-paused: ${sequenceName}`,
    body: reason,
    entityType: "sequence",
    entityId: sequenceId,
  });
}
