/**
 * Inngest cron functions that run GTM skills on a schedule.
 * Each cron scans all tenants, runs the skill, and creates notifications for findings.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { tenants, companies, contacts, notifications, users } from "@/db/schema";
import { eq, sql, desc, and, isNotNull } from "drizzle-orm";
import { runSkill } from "@/skills/runner";
import { recordLatestSignals } from "@/lib/signals/latest-signal";
import { signalScannerSkill } from "@/skills/signals/signal-scanner";
import { churnRiskDetectorSkill } from "@/skills/intelligence/churn-risk-detector";
import { expansionSignalSpotterSkill } from "@/skills/signals/expansion-signal-spotter";
import { fundingSignalMonitorSkill } from "@/skills/signals/funding-signal-monitor";
import { championTrackerSkill } from "@/skills/signals/champion-tracker";

async function getActiveTenantIds(): Promise<string[]> {
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(isNotNull(tenants.settings));
  return rows.map((r) => r.id);
}

async function createNotification(
  tenantId: string,
  type: "deal_risk" | "enrichment_done" | "new_contact" | "system",
  title: string,
  body: string,
) {
  // Fan out to every user in the tenant. `notifications.userId` is NOT NULL,
  // so cron-generated, tenant-wide notifications need one row per recipient.
  try {
    const recipients = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId));
    if (recipients.length === 0) return;
    await db.insert(notifications).values(
      recipients.map((u) => ({ tenantId, userId: u.id, type, title, body })),
    );
  } catch {
    /* non-critical: notification dispatch never blocks the cron */
  }
}

// ── Daily Signal Scanner (ROX-GAP-4: upgraded from weekly) ────
export const weeklySignalScan = inngest.createFunction(
  {
    id: "cron-daily-signal-scan",
    name: "Daily Signal Scanner",
    retries: 1,
    triggers: [{ cron: "TZ=UTC 0 7 * * 1-5" }], // Weekdays 7am UTC
  },
  async ({ step }) => {
    const tenantIds = await step.run("get-tenants", getActiveTenantIds);
    let totalSignals = 0;

    for (const tenantId of tenantIds) {
      await step.run(`scan-${tenantId}`, async () => {
        const companyRows = await db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.tenantId, tenantId))
          .orderBy(desc(companies.score))
          .limit(100);

        if (companyRows.length === 0) return;

        const result = await runSkill(signalScannerSkill, {
          companyIds: companyRows.map((c) => c.id),
          signalTypes: ["funding", "engagement_spike", "deal_stall", "tech_adoption"],
          lookbackDays: 7,
        }, { tenantId, dryRun: false });

        if (result.success && result.data) {
          const data = result.data as { totalSignalsDetected: number; signals: Array<{ companyId?: string; companyName: string; signalType: string; title: string; description?: string; detectedAt?: string }> };
          totalSignals += data.totalSignalsDetected;
          if (data.totalSignalsDetected > 0) {
            // Land the freshest signal on each company's contacts so the call
            // queue + Call Mode fiche/script (readers of properties.latestSignal,
            // which previously had NO writer) finally see real buying signals.
            await recordLatestSignals(tenantId, data.signals).catch((e) =>
              console.warn("latest-signal write failed (non-blocking)", e),
            );
            const topSignals = data.signals.slice(0, 3).map((s) => s.title).join(", ");
            await createNotification(tenantId, "system",
              `${data.totalSignalsDetected} buying signal(s) detected this week`,
              topSignals,
            );
            // D1: Link signals to open deals for proactive intelligence
            const signalsWithIds = data.signals.filter((s) => s.companyId);
            if (signalsWithIds.length > 0) {
              await inngest.send({
                name: "signals/deal-alert-check",
                data: {
                  tenantId,
                  signals: signalsWithIds.map((s) => ({
                    companyId: s.companyId!,
                    companyName: s.companyName,
                    signalType: s.signalType,
                    title: s.title,
                    description: s.description || s.title,
                  })),
                },
              }).catch((e) => console.warn("signal-to-deal-alert trigger failed (non-blocking)", e));
            }
          }
        }
      });
    }

    return { totalSignals };
  },
);

// ── Weekly Churn Risk Scan ─────────────────────────────────────
export const weeklyChurnRiskScan = inngest.createFunction(
  {
    id: "cron-weekly-churn-risk",
    name: "Weekly Churn Risk Detector",
    retries: 1,
    triggers: [{ cron: "TZ=UTC 0 9 * * 1" }], // Monday 9am UTC
  },
  async ({ step }) => {
    const tenantIds = await step.run("get-tenants", getActiveTenantIds);
    let totalAtRisk = 0;

    for (const tenantId of tenantIds) {
      await step.run(`churn-${tenantId}`, async () => {
        const result = await runSkill(churnRiskDetectorSkill, {
          lookbackDays: 60,
          inactivityThresholdDays: 21,
        }, { tenantId, dryRun: false });

        if (result.success && result.data) {
          const data = result.data as { summary: { critical: number; high: number; totalAtRiskValue: number } };
          const critical = data.summary.critical;
          const high = data.summary.high;
          totalAtRisk += critical + high;
          if (critical > 0 || high > 0) {
            await createNotification(tenantId, "deal_risk",
              `${critical + high} account(s) at risk of churning`,
              `${critical} critical, ${high} high risk. Total value at risk: $${data.summary.totalAtRiskValue.toLocaleString()}`,
            );
          }
        }
      });
    }

    return { totalAtRisk };
  },
);

// ── Weekly Expansion Signal Spotter ────────────────────────────
export const weeklyExpansionScan = inngest.createFunction(
  {
    id: "cron-weekly-expansion",
    name: "Weekly Expansion Signal Spotter",
    retries: 1,
    triggers: [{ cron: "TZ=UTC 0 10 * * 1" }], // Monday 10am UTC
  },
  async ({ step }) => {
    const tenantIds = await step.run("get-tenants", getActiveTenantIds);

    for (const tenantId of tenantIds) {
      await step.run(`expansion-${tenantId}`, async () => {
        const result = await runSkill(expansionSignalSpotterSkill, {
          lookbackDays: 30,
        }, { tenantId, dryRun: false });

        if (result.success && result.data) {
          const data = result.data as { expansionOpportunities: number; totalExpansionRevenue: number };
          if (data.expansionOpportunities > 0) {
            await createNotification(tenantId, "system",
              `${data.expansionOpportunities} expansion opportunity(ies) detected`,
              `Potential expansion revenue: $${data.totalExpansionRevenue.toLocaleString()}`,
            );
          }
        }
      });
    }
  },
);

// ── Weekly Funding Monitor ─────────────────────────────────────
export const weeklyFundingMonitor = inngest.createFunction(
  {
    id: "cron-weekly-funding-monitor",
    name: "Weekly Funding Signal Monitor",
    retries: 1,
    triggers: [{ cron: "TZ=UTC 0 7 * * 2" }], // Tuesday 7am UTC
  },
  async ({ step }) => {
    const tenantIds = await step.run("get-tenants", getActiveTenantIds);

    for (const tenantId of tenantIds) {
      await step.run(`funding-${tenantId}`, async () => {
        const companyRows = await db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.tenantId, tenantId))
          .orderBy(desc(companies.score))
          .limit(100);

        if (companyRows.length === 0) return;

        const result = await runSkill(fundingSignalMonitorSkill, {
          companyIds: companyRows.map((c) => c.id),
        }, { tenantId, dryRun: false });

        if (result.success && result.data) {
          const data = result.data as { newFundingDetected: number; signals: Array<{ companyName: string; fundingStage: string }> };
          if (data.newFundingDetected > 0) {
            const names = data.signals.slice(0, 3).map((s) => `${s.companyName} (${s.fundingStage})`).join(", ");
            await createNotification(tenantId, "system",
              `${data.newFundingDetected} new funding round(s) detected`,
              names,
            );
          }
        }
      });
    }
  },
);

// ── Monthly Champion Tracker ───────────────────────────────────
export const monthlyChampionTracker = inngest.createFunction(
  {
    id: "cron-monthly-champion-tracker",
    name: "Monthly Champion Job Change Tracker",
    retries: 1,
    triggers: [{ cron: "TZ=UTC 0 8 1 * *" }], // 1st of month, 8am UTC
  },
  async ({ step }) => {
    const tenantIds = await step.run("get-tenants", getActiveTenantIds);

    for (const tenantId of tenantIds) {
      await step.run(`champions-${tenantId}`, async () => {
        // Track contacts tagged as champions or with high engagement
        const championContacts = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(eq(contacts.tenantId, tenantId))
          .orderBy(desc(contacts.score))
          .limit(50);

        if (championContacts.length === 0) return;

        const result = await runSkill(championTrackerSkill, {
          contactIds: championContacts.map((c) => c.id),
          detectJobChange: true,
        }, { tenantId, dryRun: false });

        if (result.success && result.data) {
          const data = result.data as { changesDetected: number; changes: Array<{ contactName: string; changeType: string; currentCompany: string }> };
          if (data.changesDetected > 0) {
            const changes = data.changes
              .filter((c) => c.changeType !== "no_change")
              .slice(0, 3)
              .map((c) => `${c.contactName} → ${c.currentCompany}`)
              .join(", ");
            await createNotification(tenantId, "new_contact",
              `${data.changesDetected} champion(s) changed jobs`,
              changes,
            );
          }
        }
      });
    }
  },
);
