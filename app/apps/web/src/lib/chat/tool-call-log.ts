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
  companies,
  contacts,
  deals,
  notes,
  sequenceEnrollments,
  tasks,
  toolCallEvents,
} from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

export type ReversibleSnapshot =
  | { type: "create"; entity: "contact" | "company" | "deal" | "note" | "task"; id: string }
  | {
      type: "update";
      entity: "contact" | "company" | "deal" | "note" | "task";
      id: string;
      before: Record<string, unknown>;
    }
  | {
      type: "delete";
      entity: "contact" | "company" | "deal" | "note" | "task";
      before: Record<string, unknown>;
    }
  | {
      type: "bulk_update";
      entity: "contact" | "company" | "deal" | "note" | "task";
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
    };

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
export async function reverseToolCall(
  tenantId: string,
  userId: string,
  eventId: string
): Promise<
  | { ok: true; reverseEventId: string | null; reversedAction: string }
  | { ok: false; error: string }
> {
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

type ReversibleEntity = "contact" | "company" | "deal" | "note" | "task";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.insert(table as any).values({ ...before, tenantId });
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
    default:
      return null;
  }
}
