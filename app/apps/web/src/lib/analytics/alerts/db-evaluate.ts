/**
 * Spec 32 — DB-backed regression evaluation over the rollup snapshot history.
 * For each campaign with >=2 days of snapshots, builds current-vs-baseline and
 * runs the pure evaluateRegressions (fire-once / dedup / resolve) with a
 * Postgres-backed AlertStore. Called by the daily-rollup cron after snapshotting.
 *
 * Delivery (Slack / in-app notification) is the spec-28 follow-up — postAlert
 * logs a structured line for now, so the detection + dedup + routing are live.
 */

import { db as defaultDb } from "@/db";
import { regressionAlert } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { evaluateRegressions, type Alert, type AlertEvent, type AlertStore } from "./alerts";
import { METRIC_KEYS, type MetricKey, type MetricSnapshot } from "./detect";
import { getRollupSnapshots, type RollupSnapshotRow } from "../rollups/db-rollups";

/** Postgres AlertStore for one tenant — dedup + resolve persist across cron runs. */
export class DbAlertStore implements AlertStore {
  constructor(private readonly tenantId: string, private readonly database: typeof defaultDb = defaultDb) {}

  async activeKeys(scope: string): Promise<string[]> {
    const rows = await this.database
      .select({ key: regressionAlert.key })
      .from(regressionAlert)
      .where(and(eq(regressionAlert.tenantId, this.tenantId), eq(regressionAlert.scope, scope), eq(regressionAlert.active, true)));
    return rows.map((r) => r.key);
  }

  async isActive(key: string): Promise<boolean> {
    const [r] = await this.database.select({ active: regressionAlert.active }).from(regressionAlert).where(eq(regressionAlert.key, key)).limit(1);
    return !!r?.active;
  }

  async setActive(key: string, alert: Alert): Promise<void> {
    await this.database
      .insert(regressionAlert)
      .values({ key, tenantId: this.tenantId, scope: alert.scope, metric: alert.metric, alert, active: true })
      .onConflictDoUpdate({ target: regressionAlert.key, set: { alert, active: true, scope: alert.scope, metric: alert.metric, updatedAt: new Date() } });
  }

  async setResolved(key: string): Promise<void> {
    await this.database.update(regressionAlert).set({ active: false, updatedAt: new Date() }).where(eq(regressionAlert.key, key));
  }
}

/** current = the most recent day's metrics; baseline = average of the prior days. */
export function buildMetricSnapshot(scope: string, rows: RollupSnapshotRow[]): MetricSnapshot {
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const latest = sorted[sorted.length - 1];
  const prior = sorted.slice(0, -1);
  const current: Partial<Record<MetricKey, number>> = {};
  const baseline: Partial<Record<MetricKey, number>> = {};
  for (const k of METRIC_KEYS) {
    const m = (latest?.metrics ?? {}) as unknown as Record<string, number>;
    current[k] = m[k] ?? 0;
    if (prior.length > 0) {
      baseline[k] = prior.reduce((s, r) => s + (((r.metrics ?? {}) as unknown as Record<string, number>)[k] ?? 0), 0) / prior.length;
    }
  }
  return { scope, current, baseline };
}

/** Evaluate regressions for every campaign with a usable baseline. Returns the events. */
export async function evaluateTenantRegressions(
  tenantId: string,
  opts: { database?: typeof defaultDb } = {},
): Promise<AlertEvent[]> {
  const database = opts.database ?? defaultDb;
  const snapshots = await getRollupSnapshots(tenantId, { dimension: "campaign", database });

  const byScope = new Map<string, RollupSnapshotRow[]>();
  for (const s of snapshots) {
    const list = byScope.get(s.scopeKey) ?? [];
    list.push(s);
    byScope.set(s.scopeKey, list);
  }

  const store = new DbAlertStore(tenantId, database);
  const allEvents: AlertEvent[] = [];
  for (const [scope, rows] of byScope) {
    if (rows.length < 2) continue; // need >=2 days for a baseline
    const snapshot = buildMetricSnapshot(scope, rows);
    const events = await evaluateRegressions(snapshot, {
      store,
      postAlert: (a) =>
        console.warn(
          `[regression] tenant=${tenantId} ${a.scope} ${a.metric}=${a.current.toFixed(3)} vs baseline ${a.baseline.toFixed(3)} ` +
            `(${(a.magnitude * 100).toFixed(0)}% worse) -> route:${a.route}`,
        ),
      config: { minBaseline: 0.001 },
    });
    allEvents.push(...events);
  }
  return allEvents;
}
