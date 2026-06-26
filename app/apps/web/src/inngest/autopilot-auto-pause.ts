/**
 * AUTOPILOT-AUTOPAUSE (P0 #1) — the circuit-breaker cron. Runs daily at 06:00 UTC,
 * one hour AHEAD of daily-autopilot (07:00) so a dead sequence is paused before the
 * next enrollment wave. Mirrors the daily-autopilot shape: flag-gated (autoPauseMode),
 * concurrency 1, dead-letter log, per-tenant step.run fault isolation.
 *
 * Mode (AUTOPILOT_AUTOPAUSE_MODE): off (no-op, default) | shadow (notify only) |
 * enforce (flip status→'paused' + notify). Independent of DAILY_AUTOPILOT_ENABLED so
 * it can be turned on and observed in shadow BEFORE the autopilot itself.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { logger } from "@/lib/observability/logger";
import { autoPauseMode } from "@/lib/autopilot/flag";
import { loadSequenceHealth, DEFAULT_THRESHOLDS } from "@/lib/autopilot/sequence-health";
import { decideAutoPauseActions, pauseSequence, notifyPaused } from "@/lib/autopilot/auto-pause";

export const autopilotAutoPause = inngest.createFunction(
  {
    id: "autopilot-auto-pause",
    name: "Cron: autopilot dead-sequence auto-pause (circuit-breaker)",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }: { error: unknown }) => {
      logger.error("autopilot-auto-pause.dead_letter", {
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ cron: "0 6 * * *" }], // daily 06:00 UTC, ahead of daily-autopilot (07:00)
  },
  async ({ step }: { step: { run<T>(id: string, fn: () => Promise<T> | T): Promise<T> } }) => {
    const mode = autoPauseMode();
    if (mode === "off") return { mode, tenants: 0, paused: 0, flagged: 0 };

    const allTenants = await step.run("fetch-tenants", async () =>
      db.select({ id: tenants.id }).from(tenants)
    );

    let paused = 0;
    let flagged = 0;

    for (const t of allTenants) {
      const res = await step.run(`auto-pause-${t.id}`, async () => {
        try {
          const healths = await loadSequenceHealth(t.id, { windowDays: DEFAULT_THRESHOLDS.windowDays });
          const actions = decideAutoPauseActions(healths, mode);
          let p = 0;
          let f = 0;
          for (const a of actions) {
            if (a.action === "pause") {
              const changed = await pauseSequence(t.id, a.sequenceId, a.reason);
              if (changed) {
                await notifyPaused(t.id, a.sequenceId, a.name, a.reason);
                p++;
              }
            } else if (a.action === "notify") {
              await notifyPaused(t.id, a.sequenceId, a.name, `[shadow] ${a.reason}`);
              f++;
            }
          }
          return { p, f };
        } catch (err) {
          logger.warn("autopilot-auto-pause.tenant_failed", {
            tenantId: t.id,
            err: err instanceof Error ? err.message : String(err),
          });
          return { p: 0, f: 0 };
        }
      });
      paused += res.p;
      flagged += res.f;
    }

    logger.info("autopilot-auto-pause.run_done", { mode, tenants: allTenants.length, paused, flagged });
    return { mode, tenants: allTenants.length, paused, flagged };
  }
);
