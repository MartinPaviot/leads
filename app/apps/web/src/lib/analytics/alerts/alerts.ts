/**
 * Spec 32 — regression alert orchestration. Posts a Slack alert for each NEW
 * regression, dedupes already-active ones, and resolves a previously-active
 * metric that has recovered. Tunable per workspace. Deterministic except the
 * Slack post. Blast radius: analytics/alerts/* only.
 */

import { detectRegressions, type MetricSnapshot, type DetectConfig, type Regression, type MetricKey } from "./detect";

export interface Alert {
  key: string;
  scope: string;
  metric: MetricKey;
  current: number;
  baseline: number;
  magnitude: number;
  cause: Regression["cause"];
  route: Regression["route"];
}

export type AlertStatus = "firing" | "deduped" | "resolved";

export interface AlertEvent {
  alert: Alert;
  status: AlertStatus;
}

export interface AlertStore {
  activeKeys(scope: string): Promise<string[]>;
  isActive(key: string): Promise<boolean>;
  setActive(key: string, alert: Alert): Promise<void>;
  setResolved(key: string): Promise<void>;
}

export interface AlertDeps {
  store: AlertStore;
  /** Post an alert (spec-28 Slack). Called only for NEW regressions. */
  postAlert: (alert: Alert) => void | Promise<void>;
  /** Optional recovery notice. */
  postResolved?: (alert: Alert) => void | Promise<void>;
  config?: DetectConfig;
}

const alertKey = (scope: string, metric: MetricKey) => `${scope}:${metric}`;

function toAlert(r: Regression): Alert {
  return { key: alertKey(r.scope, r.metric), scope: r.scope, metric: r.metric, current: r.current, baseline: r.baseline, magnitude: r.magnitude, cause: r.cause, route: r.route };
}

/**
 * AC1–AC5 — evaluate one workspace/scope snapshot: fire new regressions (once),
 * dedupe active ones, resolve recovered ones. `config` carries the per-workspace
 * threshold/window.
 */
export async function evaluateRegressions(snapshot: MetricSnapshot, deps: AlertDeps): Promise<AlertEvent[]> {
  const regressions = detectRegressions(snapshot, deps.config);
  const events: AlertEvent[] = [];
  const stillRegressing = new Set<string>();

  for (const r of regressions) {
    const alert = toAlert(r);
    stillRegressing.add(alert.key);

    if (await deps.store.isActive(alert.key)) {
      events.push({ alert, status: "deduped" }); // AC3 — no repeat alert
      continue;
    }
    await deps.postAlert(alert); // AC2
    await deps.store.setActive(alert.key, alert);
    events.push({ alert, status: "firing" });
  }

  // AC3 — resolve any previously-active alert whose metric has recovered.
  for (const key of await deps.store.activeKeys(snapshot.scope)) {
    if (stillRegressing.has(key)) continue;
    await deps.store.setResolved(key);
    const metric = key.slice(snapshot.scope.length + 1) as MetricKey;
    const resolved: Alert = { key, scope: snapshot.scope, metric, current: snapshot.current[metric] ?? 0, baseline: snapshot.baseline[metric] ?? 0, magnitude: 0, cause: metric === "bounceRate" || metric === "spamRate" ? "deliverability" : "content", route: metric === "bounceRate" || metric === "spamRate" ? "guard" : "weekly" };
    await deps.postResolved?.(resolved);
    events.push({ alert: resolved, status: "resolved" });
  }

  return events;
}

/** In-memory alert store for tests / single-process dev. */
export class InMemoryAlertStore implements AlertStore {
  private readonly active = new Map<string, Alert>();
  async activeKeys(scope: string): Promise<string[]> {
    return [...this.active.keys()].filter((k) => k.startsWith(`${scope}:`));
  }
  async isActive(key: string): Promise<boolean> {
    return this.active.has(key);
  }
  async setActive(key: string, alert: Alert): Promise<void> {
    this.active.set(key, alert);
  }
  async setResolved(key: string): Promise<void> {
    this.active.delete(key);
  }
}
