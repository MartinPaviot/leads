/**
 * Spec 36 (T7) — durable backing for the runLinkedInAction deps. Today the
 * idempotency store + LinkedInActionEvent are in-memory (linkedin.ts:16); this
 * persists both to `linkedin_action_event` so a retry never double-acts across
 * restarts and `actionsToday` (the daily-limit gate) is a real COUNT visible to
 * spec-14 overlap + spec-29 rollups.
 *
 * The event row IS the idempotency record (idempotency_key is unique) — so
 * `idempotency.set` inserts it and a separate `emitEvent` is unnecessary.
 */

import { db } from "@/db";
import { linkedinActionEvent } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import type { LinkedInActionType, LinkedInResult } from "./port";
import type { LinkedInIdempotencyStore } from "./linkedin";

/** Per-(step, contact, seat) context — known before dispatch loads the seat. */
export interface LinkedInPersistenceCtx {
  tenantId: string;
  /** Our linkedin_account.id (the FK + actionsToday scope). */
  linkedinAccountId: string;
  stepId: string;
  contactId: string;
  now?: () => number;
}

function startOfUtcDay(ms: number): Date {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface LinkedInPersistence {
  idempotency: LinkedInIdempotencyStore;
  actionsToday: (senderAccountId: string, action: LinkedInActionType) => Promise<number>;
}

/**
 * Build the durable idempotency store + actionsToday counter for one dispatch.
 * Wire these into LinkedInDeps; `emitEvent` is left undefined (the idempotency
 * insert already persisted the event row).
 */
export function makeLinkedInPersistence(ctx: LinkedInPersistenceCtx): LinkedInPersistence {
  const now = ctx.now ?? (() => Date.now());

  const idempotency: LinkedInIdempotencyStore = {
    async get(key: string): Promise<LinkedInResult | null> {
      const [row] = await db
        .select({ providerActionId: linkedinActionEvent.providerActionId, action: linkedinActionEvent.action })
        .from(linkedinActionEvent)
        .where(eq(linkedinActionEvent.idempotencyKey, key))
        .limit(1);
      if (!row) return null;
      return {
        providerActionId: row.providerActionId ?? "",
        action: row.action as LinkedInActionType,
        status: "sent",
        senderAccountId: ctx.linkedinAccountId,
      };
    },
    async set(key: string, result: LinkedInResult): Promise<void> {
      await db
        .insert(linkedinActionEvent)
        .values({
          tenantId: ctx.tenantId,
          linkedinAccountId: ctx.linkedinAccountId,
          stepId: ctx.stepId,
          contactId: ctx.contactId,
          action: result.action,
          providerActionId: result.providerActionId,
          idempotencyKey: key,
          at: new Date(now()),
        })
        .onConflictDoNothing({ target: linkedinActionEvent.idempotencyKey });
    },
  };

  async function actionsToday(_senderAccountId: string, action: LinkedInActionType): Promise<number> {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(linkedinActionEvent)
      .where(
        and(
          eq(linkedinActionEvent.tenantId, ctx.tenantId),
          eq(linkedinActionEvent.linkedinAccountId, ctx.linkedinAccountId),
          eq(linkedinActionEvent.action, action),
          gte(linkedinActionEvent.at, startOfUtcDay(now())),
        ),
      );
    return n ?? 0;
  }

  return { idempotency, actionsToday };
}
