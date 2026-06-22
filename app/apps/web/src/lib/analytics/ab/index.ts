/**
 * Spec 30 — A/B significance. See _specs/30-ab-significance/RECONCILE.md.
 */

export {
  type Proportion,
  type ZTestResult,
  normalCdf,
  twoProportionZTest,
} from "./significance";

export {
  type AbMetric,
  type AbVariant,
  type AbVerdict,
  type AbComparison,
  type AbResult,
  type AbOptions,
  DEFAULT_MIN_SAMPLE,
  DEFAULT_ALPHA,
  evaluateAbTest,
} from "./ab";
