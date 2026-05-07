import { detectInvestorOverlap } from "./investor-overlap";
import { detectFundingRecent } from "./funding-recent";
import { detectFundingCrunchbase } from "./funding-crunchbase";
import { detectHiringIntent } from "./hiring-intent";
import { detectYcCompany } from "./yc-company";
import type { RegisteredSignal } from "./types";

/** Canonical registry of signals. Order determines UI column
 * order in the accounts table header. */
export const DEFAULT_SIGNALS: readonly RegisteredSignal[] = [
  { key: "investor_overlap",    detector: detectInvestorOverlap },
  { key: "funding_recent",      detector: detectFundingRecent },
  { key: "funding_crunchbase",  detector: detectFundingCrunchbase },
  { key: "hiring_intent",       detector: detectHiringIntent },
  { key: "yc_company",          detector: detectYcCompany },
] as const;

export { detectInvestorOverlap, detectFundingRecent, detectFundingCrunchbase, detectHiringIntent, detectYcCompany };
export * from "./types";
