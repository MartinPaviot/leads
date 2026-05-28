/**
 * Weekly cron — deep-dive capacity check (B7, _specs/pilae-machine/spec-v2.md R9).
 *
 * Counts each tenant's deep-dive activities scheduled inside the
 * current ISO week and persists the load + classification under
 * `tenants.settings.deepDiveLoad`. The dashboard badge reads that key
 * to render the goulot state ("ok" / "tight" / "saturated") and the
 * calendar booking endpoint reads it to refuse new bookings when the
 * cap is reached.
 *
 * Why a weekly cron and a sync read-back? The cap rule must hold even
 * if the activities table is updated by a path that doesn't immediately
 * recompute load (manual entries, external calendar sync). Running a
 * Monday morning recompute is the floor; per-booking endpoints can do
 * a cheap inline COUNT for the latest snapshot.
 *
 * Detector convention: deep-dive meetings carry
 * `activities.metadata.meetingType = 'deep_dive'`. The check is in
 * `lib/calendar/capacity.ts#isDeepDiveActivity` so producer and
 * consumer can't drift.
 *
 * Cron: every Monday 00:30 UTC, single-flight.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { activities, tenants } from "@/db/schema";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import {
  DEEP_DIVE_METADATA_KEY,
  DEEP_DIVE_METADATA_VALUE,
  classifyDeepDiveLoad,
  getDeepDiveCap,
  getIsoWeekBounds,
} from "@/lib/calendar/capacity";
import { logger } from "@/lib/observability/logger";

export const meetingCapacityCheck = inngest.createFunction(
  {
    id: "meeting-capacity-check",
    name: "Cron: deep-dive capacity check (weekly)",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }) => {
      logger.error("meeting-capacity-check.dead_letter", {
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ cron: "30 0 * * 1" }],
  },
  async ({ step }: {
    step: { run<T>(id: string, fn: () => Promise<T> | T): Promise<T> };
  }) => {
    const now = new Date();
    const { weekStart, weekEnd } = getIsoWeekBounds(now);

    const allTenants = await step.run("fetch-tenants", async () =>
      db
        .select({ id: tenants.id, settings: tenants.settings })
        .from(tenants),
    );

    const perTenant: Array<{
      tenantId: string;
      cap: number;
      count: number;
      level: ReturnType<typeof classifyDeepDiveLoad>;
    }> = [];

    for (const t of allTenants) {
      const cap = getDeepDiveCap(
        t.settings as Record<string, unknown> | null,
      );

      const [row] = await step.run(`count-${t.id}`, async () =>
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(activities)
          .where(
            and(
              eq(activities.tenantId, t.id),
              gte(activities.occurredAt, weekStart),
              lt(activities.occurredAt, weekEnd),
              sql`${activities.metadata}->>${DEEP_DIVE_METADATA_KEY} = ${DEEP_DIVE_METADATA_VALUE}`,
            ),
          ),
      );

      const count = Number(row?.count ?? 0);
      const level = classifyDeepDiveLoad(count, cap);

      // Persist the snapshot on tenant.settings so the dashboard
      // badge and the booking endpoint can read it cheaply. We
      // merge into existing settings instead of clobbering so
      // unrelated keys (deepDiveWeeklyCap, etc.) survive.
      await step.run(`persist-${t.id}`, async () => {
        const existing =
          (t.settings as Record<string, unknown> | null) ?? {};
        const next = {
          ...existing,
          deepDiveLoad: {
            count,
            cap,
            level,
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            computedAt: now.toISOString(),
          },
        };
        await db
          .update(tenants)
          .set({ settings: next, updatedAt: now })
          .where(eq(tenants.id, t.id));
      });

      perTenant.push({ tenantId: t.id, cap, count, level });

      if (level === "saturated") {
        logger.warn("meeting-capacity-check.saturated", {
          tenantId: t.id,
          count,
          cap,
          weekStart: weekStart.toISOString(),
        });
      }
    }

    return {
      week: {
        start: weekStart.toISOString(),
        end: weekEnd.toISOString(),
      },
      tenants: perTenant.length,
      saturated: perTenant.filter((p) => p.level === "saturated").length,
      tight: perTenant.filter((p) => p.level === "tight").length,
    };
  },
);
