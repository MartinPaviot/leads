import { detectInvestorOverlap } from "./investor-overlap";
import { detectFundingRecent } from "./funding-recent";
import { detectHiringIntent } from "./hiring-intent";
import { detectYcCompany } from "./yc-company";
import type { RegisteredSignal } from "./types";

/** Canonical registry of MVP signals. Order determines UI column
 * order in the accounts table header. Picking an order that reads
 * left-to-right in decreasing "ease of interpretation":
 *
 *   investor_overlap — warmest lever (warm intro possible)
 *   funding_recent   — strongest timing signal
 *   hiring_intent    — expansion / budget signal
 *   yc_company       — network signal (heuristic, dashed chip)
 *
 * When the custom-signal builder (Sprint γ) activates user-defined
 * signals, they're appended after these four. */
export const DEFAULT_SIGNALS: readonly RegisteredSignal[] = [
  { key: "investor_overlap", detector: detectInvestorOverlap },
  { key: "funding_recent",   detector: detectFundingRecent },
  { key: "hiring_intent",    detector: detectHiringIntent },
  { key: "yc_company",       detector: detectYcCompany },
] as const;

export { detectInvestorOverlap, detectFundingRecent, detectHiringIntent, detectYcCompany };
export * from "./types";
