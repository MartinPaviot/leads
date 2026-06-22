/**
 * Enrollment eligibility check — single source of truth for "can this
 * contact be enrolled into an outbound sequence right now?".
 *
 * Two consumers today:
 *   - /api/sequences/:id/enroll        (manual founder enrollment)
 *   - inngest/signal-to-sequence.ts    (auto-enroll on fresh signal)
 *
 * Both must reject contacts whose company carries an anti-ICP
 * `excluded_reason`, otherwise the founder can bypass anti-ICP rules
 * by re-enrolling. See _specs/pilae-machine/spec-v2.md (R2.3, R3.3, B1).
 *
 * Kept as a pure function so it tests without a DB and behaves
 * identically across both code paths.
 */

export type ContactEligibilityInput = {
  email: string | null;
  deletedAt: Date | null;
  companyExcludedReason: string | null;
  // P0-5 — presence in the tenant's email_optouts (hard bounce / complaint /
  // opt-out). Any non-null reason suppresses; null/undefined = not suppressed.
  suppressedReason?: "hard_bounce" | "complaint" | "opt_out" | null;
};

export type EligibilityReason =
  | "deleted"
  | "no_email"
  | "suppressed" // P0-5
  | "excluded_company";

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: EligibilityReason };

/**
 * Decide whether a contact can be enrolled in an outbound sequence.
 * Order is intentional — deletion overrides everything else, then
 * missing email (we can't email without one), then anti-ICP exclusion.
 */
export function checkContactEligibility(
  input: ContactEligibilityInput,
): EligibilityResult {
  if (input.deletedAt) return { eligible: false, reason: "deleted" };
  if (!input.email) return { eligible: false, reason: "no_email" };
  // Deliverability beats ICP: we already burned this address (bounce/complaint/
  // opt-out), so never re-email it regardless of company fit. (P0-5)
  if (input.suppressedReason) return { eligible: false, reason: "suppressed" };
  if (input.companyExcludedReason) {
    return { eligible: false, reason: "excluded_company" };
  }
  return { eligible: true };
}

export type CompanyEligibilityInput = {
  excludedReason: string | null;
  deletedAt: Date | null;
};

/**
 * Coarser company-level check used by signal-to-sequence before it
 * even fetches contacts. Saves a round-trip when the company itself
 * is anti-ICP-flagged or soft-deleted.
 */
export function isCompanyEligible(input: CompanyEligibilityInput): boolean {
  return !input.deletedAt && !input.excludedReason;
}
