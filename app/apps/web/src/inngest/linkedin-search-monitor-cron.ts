import { inngest } from "./client";
import { logger } from "@/lib/observability/logger";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { resolveConnectedSeat } from "@/lib/linkedin/seat";
import { runSourcing, type SourcingInput } from "@/lib/linkedin/source-runner";
import { activeMonitorsByTenant, recordMonitorRun } from "@/lib/linkedin/search-monitors-db";

/**
 * Layer 3 — daily, re-run each tenant's active SEARCH MONITORS (saved LinkedIn
 * ICP queries) and source the NET-NEW matches into the CRM. The canonical upsert
 * dedups, so a daily re-run only adds new rows + refreshes existing ones. This is
 * the autonomous endgame: the CRM stays fresh against an ICP without anyone
 * re-running a search.
 *
 * SOURCE-ONLY by design: a monitor NEVER enrolls / contacts — that stays the
 * HITL-gated sequence step. (jobs monitors also record a hiring signal, lifting
 * priority_score so the autopilot ranks them — but it still won't contact without
 * the founder's enrollment.)
 *
 * OFF by default behind LINKEDIN_SEARCH_MONITOR_ENABLED (a deliberate ops flip,
 * like the sibling LinkedIn crons). Each monitor is capped by its own maxPerRun
 * (defends the seat's daily view budget when hydration is on). Per-tenant +
 * per-monitor fault isolation; onFailure dead-letter.
 */
export const linkedinSearchMonitorCron = inngest.createFunction(
  {
    id: "linkedin-search-monitor",
    name: "Cron: LinkedIn search monitors -> net-new CRM rows",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }: { error: unknown }) => {
      logger.error("linkedin-search-monitor.dead_letter", { err: error instanceof Error ? error.message : String(error) });
    },
    triggers: [{ cron: "TZ=UTC 0 4 * * *" }], // 04:00 UTC daily (before the hydration crons + autopilot)
  },
  async ({ step }) => {
    const flag = process.env.LINKEDIN_SEARCH_MONITOR_ENABLED;
    if (flag !== "true" && flag !== "1") return { enabled: false };
    const cfg = readUnipileConfig();
    if (!cfg) return { enabled: true, reason: "no_unipile_config" };

    const byTenant = await step.run("active-monitors", async () => {
      const map = await activeMonitorsByTenant();
      return [...map.entries()]; // serialize the Map for the step boundary
    });

    const totals = { tenants: 0, monitorsRun: 0, accounts: 0, contacts: 0, failedTenants: 0 };

    for (const [tenantId, monitors] of byTenant) {
      const r = await step.run(`monitors-${tenantId}`, async () => {
        const seat = await resolveConnectedSeat(tenantId); // any connected seat for the tenant
        if (!seat) return { ran: 0, accounts: 0, contacts: 0, skipped: "no_seat" as const };
        let ran = 0;
        let accounts = 0;
        let contacts = 0;
        for (const m of monitors) {
          try {
            const input: SourcingInput = { ...(m.criteria as SourcingInput), maxResults: m.maxPerRun };
            const out = await runSourcing(cfg, seat, tenantId, input);
            if ("error" in out) {
              await recordMonitorRun(m.id, { at: undefined, error: out.error });
              continue;
            }
            ran++;
            accounts += out.accounts;
            contacts += out.contacts;
            await recordMonitorRun(m.id, { accounts: out.accounts, contacts: out.contacts, openRoles: out.openRoles ?? 0 });
          } catch (e) {
            await recordMonitorRun(m.id, { error: e instanceof Error ? e.message : String(e) });
          }
        }
        return { ran, accounts, contacts };
      }).catch((e) => {
        logger.warn("linkedin-search-monitor.tenant_failed", { tenantId, err: e instanceof Error ? e.message : String(e) });
        return { ran: 0, accounts: 0, contacts: 0, failed: true as const };
      });

      totals.tenants++;
      if ("failed" in r && r.failed) totals.failedTenants++;
      totals.monitorsRun += r.ran;
      totals.accounts += r.accounts;
      totals.contacts += r.contacts;
    }

    logger.info("linkedin-search-monitor.done", totals);
    return { enabled: true, ...totals };
  },
);
