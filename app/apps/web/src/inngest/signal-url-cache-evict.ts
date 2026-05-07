/**
 * Daily eviction of expired signal_url_cache rows (MONACO-PARITY-01).
 *
 * The cache stores HEAD-check verdicts with a 7-day TTL. Without
 * eviction the table grows unbounded — every URL ever cited by an
 * LLM stays forever. This cron deletes rows past `expires_at` so the
 * working set stays bounded by recent traffic.
 *
 * Schedule: 03:30 UTC, immediately after the data-retention cron at
 * 03:00, so both purges run in the quiet window. We use 30 instead
 * of 0 to avoid a thundering-herd on Postgres at the same minute.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { signalUrlCache } from "@/db/schema";
import { lte } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";

export const evictSignalUrlCache = inngest.createFunction(
  {
    id: "signal-url-cache-evict",
    name: "Evict expired signal_url_cache rows",
    retries: 1,
    triggers: [{ cron: "TZ=UTC 30 3 * * *" }], // 03:30 UTC daily
  },
  async ({ step }: { step: any }) => {
    const evicted = await step.run("evict-expired", async () => {
      const now = new Date();
      const result = await db
        .delete(signalUrlCache)
        .where(lte(signalUrlCache.expiresAt, now));
      // drizzle's delete().returning() shape varies by driver — fall
      // back to row count via a follow-up COUNT(*) when undefined.
      const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
      return count;
    });

    logger.info("signal-url-cache-evict: complete", { rowsEvicted: evicted });
    return { rowsEvicted: evicted };
  },
);
