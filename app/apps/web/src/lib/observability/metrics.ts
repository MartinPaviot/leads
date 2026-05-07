/**
 * Lightweight metrics emission primitive (P0-5 task 5.7).
 *
 * Two emit shapes :
 *   - `metrics.increment(name, tags?)` — counter (+1 per call)
 *   - `metrics.histogram(name, value, tags?)` — distribution
 *
 * Backend strategy
 * ────────────────
 * Production : a Datadog agent / Statsd UDP socket, configured via
 *   `DD_API_KEY` and `DD_SITE`. The Inngest worker container ships
 *   metrics through the local Datadog agent sidecar — no extra
 *   network hop on the hot path.
 * Dev / no-DD : structured logger.info under the `metric` event.
 *   Greppable, indexable in any log aggregator (Logtail, Loki, etc.).
 *
 * Until the Datadog agent shim is wired (separate infra ticket),
 * both paths funnel through the logger. The structured shape is the
 * stable contract — moving to Datadog is a one-line dispatcher swap.
 *
 * Why a wrapper rather than calling logger.info directly :
 *   1. Single grep target — every metric uses `event: "metric"`,
 *      so dashboards, alerts, and ad-hoc analysis stay coherent
 *      regardless of where in the codebase the metric is emitted.
 *   2. Tag normalisation — undefined tag values strip out (avoids
 *      `tag=undefined` polluting cardinality), boolean/number tags
 *      flatten to strings.
 *   3. Future-proof — switching to a real Datadog client only
 *      changes this file ; call sites stay identical.
 */

import { logger } from "./logger";

export type MetricTags = Record<string, string | number | boolean | undefined | null>;

function normaliseTags(tags?: MetricTags): Record<string, string> | undefined {
  if (!tags) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface MetricsClient {
  increment(name: string, tags?: MetricTags): void;
  histogram(name: string, value: number, tags?: MetricTags): void;
}

class LoggerMetricsClient implements MetricsClient {
  increment(name: string, tags?: MetricTags): void {
    logger.info("metric", {
      kind: "count",
      name,
      value: 1,
      tags: normaliseTags(tags),
    });
  }

  histogram(name: string, value: number, tags?: MetricTags): void {
    if (!Number.isFinite(value)) return;
    logger.info("metric", {
      kind: "histogram",
      name,
      value,
      tags: normaliseTags(tags),
    });
  }
}

/**
 * Test-only sink — call sites use `metrics` ; tests can inject a
 * recorder by overriding `setMetricsClient(new RecordingMetricsClient())`
 * in beforeEach.
 */
export class RecordingMetricsClient implements MetricsClient {
  public counts: Array<{ name: string; tags?: Record<string, string> }> = [];
  public histograms: Array<{ name: string; value: number; tags?: Record<string, string> }> = [];

  increment(name: string, tags?: MetricTags): void {
    this.counts.push({ name, tags: normaliseTags(tags) });
  }

  histogram(name: string, value: number, tags?: MetricTags): void {
    if (!Number.isFinite(value)) return;
    this.histograms.push({ name, value, tags: normaliseTags(tags) });
  }

  reset() {
    this.counts = [];
    this.histograms = [];
  }
}

let activeClient: MetricsClient = new LoggerMetricsClient();

export const metrics: MetricsClient = {
  increment(name, tags) {
    activeClient.increment(name, tags);
  },
  histogram(name, value, tags) {
    activeClient.histogram(name, value, tags);
  },
};

/** Swap the active backend. Tests use this ; production wires the
 *  Datadog client at app boot. */
export function setMetricsClient(client: MetricsClient): void {
  activeClient = client;
}

/** Reset to the default logger backend. Call between test suites. */
export function resetMetricsClient(): void {
  activeClient = new LoggerMetricsClient();
}
