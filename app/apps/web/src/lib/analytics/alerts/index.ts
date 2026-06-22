/**
 * Spec 32 — regression alerts. See _specs/32-regression-alerts/RECONCILE.md.
 */

export {
  type MetricKey,
  type RegressionCause,
  type RegressionRoute,
  type MetricSnapshot,
  type Regression,
  type DetectConfig,
  METRIC_KEYS,
  detectRegressions,
} from "./detect";

export {
  type Alert,
  type AlertStatus,
  type AlertEvent,
  type AlertStore,
  type AlertDeps,
  evaluateRegressions,
  InMemoryAlertStore,
} from "./alerts";
