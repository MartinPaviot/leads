/**
 * Event log + reversal logic for chat tool calls.
 *
 * Every mutation-class tool is expected to call `logToolCall()` after
 * a successful execute. The event row captures enough state
 * (`snapshot`) to let `reverseToolCall()` undo the mutation later.
 *
 * Reversal strategies by snapshot.type:
 *   - { type: "create", entity, id }       → soft/hard-delete by id
 *   - { type: "update", entity, id, before } → restore `before` fields
 *   - { type: "delete", entity, before }   → re-insert `before`
 *   - { type: "merge_contacts", survivor, merged } → un-merge (future)
 *
 * This module is defensive: if tool_call_events doesn't exist yet
 * (migration not applied), logging silently no-ops so chat mutations
 * keep working. Reversal errors bubble up so the user sees them.
 */

import { db } from "@/db";
import {
  activities,
  comments,
  companies,
  contacts,
  deals,
  notes,
  sequenceEnrollments,
  sequenceSteps,
  sequences,
  sharedPrompts,
  tasks,
  toolCallEvents,
} from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { invokeActionDirective } from "@/lib/chat/ui-directives"; // CLE-03 builder — do NOT re-implement
import { cancelHeldOutbound } from "@/lib/emails/outbound-hold"; // CLE-11 outbound cancel seam

type ReversibleEntityLoose =
  | "contact"
  | "company"
  | "deal"
  | "note"
  | "task"
  | "activity"
  | "sequence"
  | "sequence_step"
  | "comment"
  | "shared_prompt";

export type ReversibleSnapshot =
  | { type: "create"; entity: ReversibleEntityLoose; id: string }
  | {
      type: "update";
      entity: ReversibleEntityLoose;
      id: string;
      before: Record<string, unknown>;
    }
  | {
      type: "delete";
      entity: ReversibleEntityLoose;
      before: Record<string, unknown>;
    }
  | {
      type: "bulk_update";
      entity: ReversibleEntityLoose;
      rows: Array<{ id: string; before: Record<string, unknown> }>;
    }
  | {
      /**
       * mergeContacts snapshot. Reversal re-inserts merged rows and
       * re-points FKs back to their original contactId. Best-effort:
       * if any FK target row has been deleted in the meantime, it's
       * skipped.
       */
      type: "merge_contacts";
      survivorId: string;
      mergedRows: Array<Record<string, unknown>>;
      repoints: {
        activities: Array<{ id: string; originalEntityId: string }>;
        deals: Array<{ id: string; originalContactId: string }>;
        sequenceEnrollments: Array<{ id: string; originalContactId: string }>;
        tasks: Array<{ id: string; originalEntityId: string }>;
      };
    }
  | {
      /**
       * deleteSequenceStep snapshot. The DELETE path renumbers
       * remaining steps so we snapshot the full pre-delete set and
       * on reverse wipe the current steps + re-insert from snapshot.
       */
      type: "delete_sequence_step";
      sequenceId: string;
      stepsBefore: Array<Record<string, unknown>>;
    }
  | {
      /**
       * CLE-11: a Page Action (PAR) reversed by RE-INVOKING a declared inverse
       * action on the live page. The closure that ran the forward action cannot
       * be serialized or survive a page unmount, so the server log holds only
       * the inverse DESCRIPTOR (actionId + params), never a closure. reverseToolCall
       * returns an invokeAction directive for this inverse; the client runs it via
       * runRegisteredAction (the same CLE-03 path the forward action used). The
       * event is marked reverted optimistically on DISPATCH and reconciled when
       * the reversal envelope returns (design §3.3). For PAR effects that are pure
       * server-owned rows, prefer a create/update/delete snapshot instead (Mode A,
       * AC-6) — reversed server-side with no round-trip.
       */
      type: "page_action";
      actionId: string; // the original action id (forensics)
      inverse: { actionId: string; params: Record<string, unknown> };
    }
  | {
      /**
       * CLE-11: an outbound send placed on a cancellable hold (the undo window).
       * Reversal cancels the held outbound_emails row before it leaves; after the
       * window elapses and the row is released/sent it is irreversible (AC-11).
       */
      type: "outbound_send";
      outboundEmailId: string;
      holdUntil: string; // ISO — for the "already sent" message
      channel: "email" | "sequence_step" | "meeting_invite";
    };

/** The entities `restoreEntity`/`reinsertEntity` can actually act on (kept in
 *  sync with their switch). The validator below rejects any snapshot naming an
 *  entity outside this set, so a forged `entity` can never even be persisted. */
const REVERSIBLE_ENTITIES: ReadonlySet<string> = new Set<ReversibleEntityLoose>([
  "contact", "company", "deal", "note", "task",
  "activity", "sequence", "sequence_step", "comment", "shared_prompt",
]);

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isEntity = (v: unknown): boolean => typeof v === "string" && REVERSIBLE_ENTITIES.has(v);

/**
 * CLE-11 FOLLOWUPS #2 — structural validation of a client-asserted Mode-A
 * (`undo.kind:"server"`) snapshot BEFORE it is persisted. At reversal every
 * entity is tenant-confined — most tables filter on their own `tenantId` column,
 * and `sequence_step` (which has none) is confined through its parent sequence's
 * tenant (see sequenceStepOwnedByTenant / sequenceOwnedByTenant) — so a forged
 * snapshot can't escape the actor's tenant. This is the WRITE-time complement:
 * previously a malformed snapshot was stored verbatim and only failed when the
 * user clicked undo. This validates
 * the discriminant + required fields + entity allowlist at WRITE time, so a
 * malformed/forged snapshot is rejected up front (the action logs as
 * non-undoable rather than appearing undoable and failing later). It can only
 * REJECT — a well-formed snapshot is unchanged.
 */
export function isValidReversibleSnapshot(s: unknown): s is ReversibleSnapshot {
  if (!isObj(s)) return false;
  switch (s.type) {
    case "create":
      return isEntity(s.entity) && isStr(s.id);
    case "update":
      return isEntity(s.entity) && isStr(s.id) && isObj(s.before);
    case "delete":
      return isEntity(s.entity) && isObj(s.before);
    case "bulk_update":
      return (
        isEntity(s.entity) &&
        Array.isArray(s.rows) &&
        s.rows.every((r) => isObj(r) && isStr(r.id) && isObj(r.before))
      );
    case "merge_contacts":
      return (
        isStr(s.survivorId) &&
        Array.isArray(s.mergedRows) &&
        isObj(s.repoints) &&
        Array.isArray((s.repoints as Record<string, unknown>).activities) &&
        Array.isArray((s.repoints as Record<string, unknown>).deals) &&
        Array.isArray((s.repoints as Record<string, unknown>).sequenceEnrollments) &&
        Array.isArray((s.repoints as Record<string, unknown>).tasks)
      );
    case "delete_sequence_step":
      return isStr(s.sequenceId) && Array.isArray(s.stepsBefore);
    case "page_action":
      return (
        isStr(s.actionId) &&
        isObj(s.inverse) &&
        isStr((s.inverse as Record<string, unknown>).actionId) &&
        isObj((s.inverse as Record<string, unknown>).params)
      );
    case "outbound_send":
      return (
        isStr(s.outboundEmailId) &&
        isStr(s.holdUntil) &&
        (s.channel === "email" || s.channel === "sequence_step" || s.channel === "meeting_invite")
      );
    default:
      return false;
  }
}

export interface LogToolCallInput {
  tenantId: string;
  userId: string;
  threadId?: string;
  messageId?: string;
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  status?: "executed" | "failed";
  snapshot?: ReversibleSnapshot | null;
  surfaceType?: string;
  errorMessage?: string;
}

/**
 * Record a tool call event. Fire-and-forget safe: silently swallows
 * any DB error so tool execution isn't blocked by a missing migration
 * or transient insert failure.
 */
export async function logToolCall(input: LogToolCallInput): Promise<string | null> {
  try {
    const [row] = await db
      .insert(toolCallEvents)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        threadId: input.threadId,
        messageId: input.messageId,
        toolName: input.toolName,
        args: input.args,
        result: input.result,
        status: input.status || "executed",
        snapshot: input.snapshot ?? undefined,
        surfaceType: input.surfaceType,
        errorMessage: input.errorMessage,
      })
      .returning({ id: toolCallEvents.id });
    return row?.id || null;
  } catch (err) {
    // Migration might not be applied yet, or DB is unreachable.
    // Swallow silently — the primary tool mutation already succeeded.
    console.warn("tool-call-log: logToolCall failed (non-fatal)", err);
    return null;
  }
}

export interface LogPageActionCallInput {
  tenantId: string;
  userId: string;
  threadId?: string;
  /** The invoked Page Action id, e.g. "opportunities.moveStage". */
  actionId: string;
  /** The validated params the action ran with. */
  params: Record<string, unknown>;
  /** From the result envelope (README §3.5). status="failed" when false. */
  ok: boolean;
  /** Human-readable outcome from the envelope. */
  summary?: string;
  /** Failure reason from the envelope, when ok=false. */
  error?: string;
  /** Surface context (forensics), e.g. "opportunities". */
  surfaceType?: string;
  /**
   * The reversal snapshot. Either a page_action inverse descriptor (Mode B,
   * client re-invocation) or a server-owned create/update/delete snapshot
   * (Mode A). null when the action declared no usable undo (treated as not
   * reversible). On ok=false this is forced to null (a failed action changed
   * nothing).
   */
  snapshot?: ReversibleSnapshot | null;
}

/**
 * CLE-11 — record a mutating Page Action (PAR) in tool_call_events.
 *
 * The CALLER decides whether to call this: pure reads (manifest `mutating:false`)
 * are NOT audited (AC-2), exactly as no headless read calls logToolCall. This
 * helper is a thin adapter over logToolCall so there is ONE audit-write path:
 *  - toolName is namespaced `invokePageAction:<actionId>` so forensics/undo can
 *    tell a PAR action from a headless tool without a schema change.
 *  - args mirrors the headless convention: the validated input.
 *  - status is "executed" only on ok:true (AC-1); "failed" + errorMessage on
 *    ok:false, and a failed row carries snapshot:null so it is never a reversal
 *    candidate (AC-4).
 *
 * Fire-and-forget safe (inherits logToolCall's swallow): only this undo row is
 * lost if the insert fails (E-7) — never blocks the action, which already ran.
 */
export async function logPageActionCall(
  input: LogPageActionCallInput,
): Promise<string | null> {
  const failed = !input.ok;
  return logToolCall({
    tenantId: input.tenantId,
    userId: input.userId,
    threadId: input.threadId,
    toolName: `invokePageAction:${input.actionId}`,
    args: { actionId: input.actionId, params: input.params },
    result: {
      ok: input.ok,
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.error ? { error: input.error } : {}),
    },
    status: failed ? "failed" : "executed",
    // A failed action changed nothing → never reversible.
    snapshot: failed ? null : input.snapshot ?? null,
    surfaceType: input.surfaceType,
    errorMessage: failed ? input.error ?? "Page action failed" : undefined,
  });
}

/**
 * CLE-11 reconcile path (E-3). Re-open a previously (optimistically) reverted
 * event so it is reversible again — used when a PAR client-inverse reversal
 * came back ok:false/action_not_registered (the inverse could not run because
 * the page is gone). Tenant/user-scoped. Returns true if a row was re-opened.
 */
export async function reopenEvent(
  tenantId: string,
  userId: string,
  eventId: string,
): Promise<boolean> {
  try {
    const res = await db
      .update(toolCallEvents)
      .set({ status: "executed", revertedAt: null })
      .where(
        and(
          eq(toolCallEvents.id, eventId),
          eq(toolCallEvents.tenantId, tenantId),
          eq(toolCallEvents.userId, userId),
        ),
      )
      .returning({ id: toolCallEvents.id });
    return res.length > 0;
  } catch (err) {
    console.warn("tool-call-log: reopenEvent failed", err);
    return false;
  }
}

/**
 * Find the most recent reversible tool call for this user, scoped to
 * tenant. Skips events that have already been reverted.
 */
export async function getLastReversibleCall(
  tenantId: string,
  userId: string
): Promise<typeof toolCallEvents.$inferSelect | null> {
  try {
    const rows = await db
      .select()
      .from(toolCallEvents)
      .where(
        and(
          eq(toolCallEvents.tenantId, tenantId),
          eq(toolCallEvents.userId, userId),
          eq(toolCallEvents.status, "executed"),
          isNull(toolCallEvents.revertedAt)
        )
      )
      .orderBy(desc(toolCallEvents.executedAt))
      .limit(5);
    // Return first row with a reversible snapshot
    for (const row of rows) {
      if (row.snapshot) return row;
    }
    return null;
  } catch (err) {
    console.warn("tool-call-log: getLastReversibleCall failed", err);
    return null;
  }
}

/**
 * Reverse a previously logged tool call by its event id.
 * Returns { ok: true, reverseEventId } on success.
 */
/**
 * The result of a reversal. The base success shape (server-owned undo) is
 * unchanged. CLE-11 adds two OPTIONAL fields used only by a `page_action`
 * (client-inverse) reversal: `directive` is an invokeAction directive the
 * undoLastAction tool spreads so the client runs the inverse on the live page,
 * and `reconcileEventId` lets the envelope-ingest re-open the event if that
 * inverse cannot run (E-3). Server-owned and outbound reversals never set them.
 */
export type ReverseToolCallResult =
  | {
      ok: true;
      reverseEventId: string | null;
      reversedAction: string;
      directive?: ReturnType<typeof invokeActionDirective>;
      reconcileEventId?: string;
    }
  | { ok: false; error: string };

export async function reverseToolCall(
  tenantId: string,
  userId: string,
  eventId: string
): Promise<ReverseToolCallResult> {
  const [event] = await db
    .select()
    .from(toolCallEvents)
    .where(
      and(
        eq(toolCallEvents.id, eventId),
        eq(toolCallEvents.tenantId, tenantId),
        eq(toolCallEvents.userId, userId)
      )
    )
    .limit(1);

  if (!event) return { ok: false, error: "Event not found" };
  if (event.revertedAt) {
    return { ok: false, error: "Event already reverted" };
  }

  const snapshot = event.snapshot as ReversibleSnapshot | null;
  if (!snapshot) {
    return { ok: false, error: "Event has no reversible snapshot" };
  }

  try {
    if (snapshot.type === "create") {
      await deleteByEntityId(snapshot.entity, snapshot.id, tenantId);
    } else if (snapshot.type === "update") {
      await restoreEntity(snapshot.entity, snapshot.id, snapshot.before, tenantId);
    } else if (snapshot.type === "delete") {
      await reinsertEntity(snapshot.entity, snapshot.before, tenantId);
    } else if (snapshot.type === "merge_contacts") {
      // Re-insert merged contacts first (so FK revert targets exist)
      let restoredRows = 0;
      let repointedCount = 0;
      for (const row of snapshot.mergedRows) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await db.insert(contacts).values(row as any);
          restoredRows++;
        } catch {
          // Row may already exist (partial previous un-merge) — skip
        }
      }
      // Revert FK repoints
      for (const r of snapshot.repoints.activities) {
        try {
          await db
            .update(activities)
            .set({ entityId: r.originalEntityId })
            .where(
              and(eq(activities.id, r.id), eq(activities.tenantId, tenantId))
            );
          repointedCount++;
        } catch {
          // skip
        }
      }
      for (const r of snapshot.repoints.deals) {
        try {
          await db
            .update(deals)
            .set({ contactId: r.originalContactId })
            .where(and(eq(deals.id, r.id), eq(deals.tenantId, tenantId)));
          repointedCount++;
        } catch {
          // skip
        }
      }
      for (const r of snapshot.repoints.sequenceEnrollments) {
        try {
          await db
            .update(sequenceEnrollments)
            .set({ contactId: r.originalContactId })
            .where(eq(sequenceEnrollments.id, r.id));
          repointedCount++;
        } catch {
          // skip
        }
      }
      for (const r of snapshot.repoints.tasks) {
        try {
          await db
            .update(tasks)
            .set({ entityId: r.originalEntityId })
            .where(and(eq(tasks.id, r.id), eq(tasks.tenantId, tenantId)));
          repointedCount++;
        } catch {
          // skip
        }
      }
      await db
        .update(toolCallEvents)
        .set({ status: "reverted", revertedAt: new Date() })
        .where(eq(toolCallEvents.id, eventId));
      return {
        ok: true,
        reverseEventId: null,
        reversedAction: `mergeContacts (restored ${restoredRows} contact(s), reverted ${repointedCount} FK(s))`,
      };
    } else if (snapshot.type === "delete_sequence_step") {
      // Wipe current steps of the sequence, then re-insert from
      // snapshot to restore the exact pre-delete numbering.
      await db
        .delete(sequenceSteps)
        .where(eq(sequenceSteps.sequenceId, snapshot.sequenceId));
      let restored = 0;
      for (const s of snapshot.stepsBefore) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await db.insert(sequenceSteps).values(s as any);
          restored++;
        } catch {
          // skip
        }
      }
      await db
        .update(toolCallEvents)
        .set({ status: "reverted", revertedAt: new Date() })
        .where(eq(toolCallEvents.id, eventId));
      return {
        ok: true,
        reverseEventId: null,
        reversedAction: `deleteSequenceStep (restored ${restored} step(s))`,
      };
    } else if (snapshot.type === "bulk_update") {
      // Restore every row in the bulk set. Best-effort: errors on any
      // single row are swallowed so we still revert as much as possible.
      // Reports the per-row outcome in the return text.
      let restored = 0;
      let failed = 0;
      for (const row of snapshot.rows) {
        try {
          await restoreEntity(snapshot.entity, row.id, row.before, tenantId);
          restored++;
        } catch {
          failed++;
        }
      }
      await db
        .update(toolCallEvents)
        .set({ status: "reverted", revertedAt: new Date() })
        .where(eq(toolCallEvents.id, eventId));
      return {
        ok: true,
        reverseEventId: null,
        reversedAction: `${event.toolName} (${restored} restored, ${failed} failed)`,
      };
    } else if (snapshot.type === "page_action") {
      // CLE-11 Mode B — client-side reversal. We cannot run the inverse here
      // (it lives on the page). Emit an invokeAction directive for the declared
      // inverse; the client runs it and round-trips an [[action-result]]
      // envelope. Mark reverted on DISPATCH (the server's only synchronous
      // observable); the envelope-ingest reconciles on failure via
      // reconcileEventId (design §3.3, E-3). The inverse runs through the SAME
      // registry gate as the forward action — only a currently-registered id
      // can run, so a forged/stale inverse id is a no-op (action_not_registered).
      const invocationId = crypto.randomUUID();
      await db
        .update(toolCallEvents)
        .set({ status: "reverted", revertedAt: new Date() })
        .where(eq(toolCallEvents.id, eventId));
      return {
        ok: true,
        reverseEventId: null,
        reversedAction: `${event.toolName} (undo sent to the page)`,
        directive: invokeActionDirective(
          invocationId,
          snapshot.inverse.actionId,
          snapshot.inverse.params,
          false, // requireConfirm:false — an undo runs without a second confirm
          eventId, // reconcileEventId — echoed back so E-3 can re-open on failure
        ),
        reconcileEventId: eventId,
      };
    } else if (snapshot.type === "outbound_send") {
      // CLE-11 scope c — cancel a held outbound send within its window. Atomic +
      // tenant-scoped (held → canceled). After the window the row has been
      // released/sent, so cancel matches 0 rows → refuse honestly, leaving the
      // event NOT reverted (AC-11/E-5).
      const cancel = await cancelHeldOutbound(tenantId, snapshot.outboundEmailId);
      if (!cancel.canceled) {
        return {
          ok: false,
          error: `This email was already sent ${snapshot.holdUntil} and can't be unsent.`,
        };
      }
      await db
        .update(toolCallEvents)
        .set({ status: "reverted", revertedAt: new Date() })
        .where(eq(toolCallEvents.id, eventId));
      return {
        ok: true,
        reverseEventId: null,
        reversedAction: "email send (canceled before it left)",
      };
    } else {
      return { ok: false, error: `Unsupported snapshot type` };
    }

    // Mark reverted
    await db
      .update(toolCallEvents)
      .set({ status: "reverted", revertedAt: new Date() })
      .where(eq(toolCallEvents.id, eventId));

    return {
      ok: true,
      reverseEventId: null,
      reversedAction: event.toolName,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Reversal failed: ${msg}` };
  }
}

type ReversibleEntity =
  | "contact"
  | "company"
  | "deal"
  | "note"
  | "task"
  | "activity"
  | "sequence"
  | "sequence_step"
  | "comment"
  | "shared_prompt";

/**
 * sequence_steps has NO tenantId column — its only tenant anchor is the parent
 * sequence's FK. These helpers confine every sequence_step reversal op to the
 * actor's tenant so a forged/client-asserted snapshot can never reach another
 * tenant's step (the hole the write-time `isValidReversibleSnapshot` allowlist
 * could not close on its own, since it green-lists the entity by name).
 */
async function sequenceStepOwnedByTenant(stepId: string, tenantId: string): Promise<boolean> {
  const [owned] = await db
    .select({ id: sequenceSteps.id })
    .from(sequenceSteps)
    .innerJoin(sequences, eq(sequences.id, sequenceSteps.sequenceId))
    .where(and(eq(sequenceSteps.id, stepId), eq(sequences.tenantId, tenantId)))
    .limit(1);
  return !!owned;
}
async function sequenceOwnedByTenant(sequenceId: string, tenantId: string): Promise<boolean> {
  const [owned] = await db
    .select({ id: sequences.id })
    .from(sequences)
    .where(and(eq(sequences.id, sequenceId), eq(sequences.tenantId, tenantId)))
    .limit(1);
  return !!owned;
}

async function deleteByEntityId(
  entity: ReversibleEntity,
  id: string,
  tenantId: string
): Promise<void> {
  if (entity === "contact") {
    await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)));
  } else if (entity === "company") {
    await db.delete(companies).where(and(eq(companies.id, id), eq(companies.tenantId, tenantId)));
  } else if (entity === "deal") {
    await db.delete(deals).where(and(eq(deals.id, id), eq(deals.tenantId, tenantId)));
  } else if (entity === "note") {
    await db.delete(notes).where(and(eq(notes.id, id), eq(notes.tenantId, tenantId)));
  } else if (entity === "task") {
    await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));
  } else if (entity === "activity") {
    await db
      .delete(activities)
      .where(and(eq(activities.id, id), eq(activities.tenantId, tenantId)));
  } else if (entity === "sequence") {
    await db
      .delete(sequences)
      .where(and(eq(sequences.id, id), eq(sequences.tenantId, tenantId)));
  } else if (entity === "sequence_step") {
    // sequence_steps has no tenantId column — confine via the parent sequence so
    // a forged snapshot cannot delete another tenant's step.
    if (await sequenceStepOwnedByTenant(id, tenantId)) {
      await db.delete(sequenceSteps).where(eq(sequenceSteps.id, id));
    }
  } else if (entity === "comment") {
    await db
      .delete(comments)
      .where(and(eq(comments.id, id), eq(comments.tenantId, tenantId)));
  } else if (entity === "shared_prompt") {
    await db
      .delete(sharedPrompts)
      .where(and(eq(sharedPrompts.id, id), eq(sharedPrompts.tenantId, tenantId)));
  }
}

async function restoreEntity(
  entity: string,
  id: string,
  before: Record<string, unknown>,
  tenantId: string
): Promise<void> {
  const table = pickTable(entity);
  if (!table) throw new Error(`Unknown entity: ${entity}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setClause: any = { ...before, updatedAt: new Date() };
  // don't allow the snapshot to overwrite id/tenantId
  delete setClause.id;
  delete setClause.tenantId;
  delete setClause.tenant_id;
  if (entity === "sequence_step") {
    // sequence_steps has neither a tenantId NOR an updatedAt column — the generic
    // path below would reference both and crash. Confine via the parent sequence
    // and update by id only (a foreign/forged step is a silent no-op).
    delete setClause.updatedAt;
    if (await sequenceStepOwnedByTenant(id, tenantId)) {
      await db.update(sequenceSteps).set(setClause).where(eq(sequenceSteps.id, id));
    }
    return;
  }
  await db
    .update(table)
    .set(setClause)
    .where(
      and(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eq((table as any).id, id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eq((table as any).tenantId, tenantId)
      )
    );
}

async function reinsertEntity(
  entity: string,
  before: Record<string, unknown>,
  tenantId: string
): Promise<void> {
  const table = pickTable(entity);
  if (!table) throw new Error(`Unknown entity: ${entity}`);
  if (entity === "sequence_step") {
    // No tenantId column — confine by verifying the snapshot's parent sequence
    // belongs to this tenant before re-inserting, so a forged delete-snapshot
    // can't inject a step into another tenant's sequence.
    const seqId = (before.sequenceId ?? before.sequence_id) as unknown;
    if (typeof seqId !== "string" || !(await sequenceOwnedByTenant(seqId, tenantId))) {
      return; // foreign / missing parent — refuse the re-insert
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(sequenceSteps).values(before as any);
    return;
  }
  // Spread the full snapshot. If it carried tenantId, we enforce the
  // caller's; otherwise (tables without tenantId column, e.g.
  // sequence_enrollment) we leave the spread as-is.
  const payload: Record<string, unknown> = { ...before };
  if ("tenantId" in payload || "tenant_id" in payload) {
    payload.tenantId = tenantId;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.insert(table as any).values(payload);
}

function pickTable(entity: string) {
  switch (entity) {
    case "contact":
      return contacts;
    case "company":
      return companies;
    case "deal":
      return deals;
    case "note":
      return notes;
    case "task":
      return tasks;
    case "activity":
      return activities;
    case "sequence":
      return sequences;
    case "sequence_step":
      return sequenceSteps;
    case "comment":
      return comments;
    case "shared_prompt":
      return sharedPrompts;
    default:
      return null;
  }
}
