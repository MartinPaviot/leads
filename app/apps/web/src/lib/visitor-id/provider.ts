/**
 * Visitor-ID provider abstraction (MONACO-PARITY-04).
 *
 * Decision per Monaco: ship Snitcher as the default provider —
 * Monaco itself uses Snitcher on monaco.com (verified via teardown
 * network analysis). RB2B / Clearbit Reveal slots remain available
 * via the same interface for tenants that prefer them.
 *
 * Privacy posture: this module returns ONLY a company domain — never
 * a person identity. The B2B-IP-to-firmographic match is firmographic
 * (legal entity), not a personal identifier. Per-person identification
 * would require a separate consent path we deliberately do not build.
 */

export interface VisitorIdResult {
  companyDomain: string;
  companyName: string | null;
  /** Provider-reported confidence 0-1, or null if unscored. */
  confidence: number | null;
}

export interface VisitorIdProvider {
  /** Provider name — used for telemetry + the `identified_by` column. */
  name: string;
  /** True when credentials are present and the provider is callable. */
  isAvailable(): boolean;
  /**
   * Identify a visit. Returns `null` when no match (~50% of B2B
   * traffic) OR when the provider is unavailable. Never throws.
   */
  identify(input: {
    ip: string;
    userAgent?: string | null;
    url?: string | null;
  }): Promise<VisitorIdResult | null>;
}
