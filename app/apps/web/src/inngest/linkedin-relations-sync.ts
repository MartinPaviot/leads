import { inngest } from "./client";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { syncLinkedInRelations, type SyncSeat } from "@/lib/sending/linkedin/graph-sync";
import logger from "@/lib/observability/logger";

/**
 * Spec 36 (T9) — build the warm-path graph from a connected seat's LinkedIn
 * 1st-degree relations. Event-driven, NOT a nightly sweep: fired on connect (the
 * account-webhook) so the seat's network becomes KNOWS edges the moment it's
 * attached, and the accounts "Connected to" column lights up. Post-source
 * matching uses the cheap snapshot rematch (rematchStoredRelations) instead, so
 * this full Unipile pull only runs on connect/reconnect — no unbounded cost.
 *
 * concurrency keyed per seat: a connect quickly followed by a reconnect won't
 * double-pull the same network. retries cover a transient Unipile blip.
 */
export const syncLinkedInRelationsForSeat = inngest.createFunction(
  {
    id: "linkedin-relations-sync",
    name: "LinkedIn: Relations -> Warm-Path Graph",
    retries: 2,
    concurrency: [{ limit: 1, key: "event.data.seatId" }],
    triggers: [{ event: "linkedin/relations.sync" }],
  },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as { seatId?: string; unipileAccountId?: string };
    if (!readUnipileConfig()) return { skipped: "unipile-not-configured" };

    const seat = await step.run("load-seat", async (): Promise<SyncSeat | null> => {
      const cond = data.seatId
        ? eq(linkedinAccount.id, data.seatId)
        : data.unipileAccountId
          ? eq(linkedinAccount.unipileAccountId, data.unipileAccountId)
          : null;
      if (!cond) return null;
      const [row] = await db
        .select({
          id: linkedinAccount.id,
          tenantId: linkedinAccount.tenantId,
          userId: linkedinAccount.userId,
          displayName: linkedinAccount.displayName,
          status: linkedinAccount.status,
          unipileAccountId: linkedinAccount.unipileAccountId,
        })
        .from(linkedinAccount)
        .where(cond)
        .limit(1);
      if (!row || row.status !== "connected" || !row.unipileAccountId) return null;
      return {
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        userName: row.displayName ?? "LinkedIn seat owner",
        unipileAccountId: row.unipileAccountId,
      };
    });

    if (!seat) return { skipped: "no-connected-seat" };

    const result = await step.run("sync-relations", () => syncLinkedInRelations(seat));
    logger.info("linkedin/relations.sync done", { seatId: seat.id, ...result });
    return result;
  },
);
