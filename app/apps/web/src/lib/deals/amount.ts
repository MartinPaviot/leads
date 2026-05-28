/**
 * Deal amount display — single source of truth for "what numbers do we
 * show for this deal, and how?".
 *
 * Pilae sells two streams that must never be blended in reporting
 * (see _specs/pilae-machine/spec-v2.md R8.4 + guardrail 5):
 *   - projectAmount : one-time project booking (recognised on delivery)
 *   - platformArr   : recurring platform booking, annualised (ARR-eligible)
 *
 * Legacy deals (created before B2 shipped) only carry the single
 * `value` column. This helper unifies both shapes so UI/reporting can
 * surface them correctly without re-implementing the fallback rule.
 *
 * The helper's contract:
 *   - If either split field is set → use the split, total = project + platform.
 *   - Otherwise → fall back to legacy `value` as the total, with
 *     `project = 0` and `platform = 0` so call-sites can confidently
 *     render "project / platform / total" rows without ad-hoc null checks.
 *   - `isSplit` tells the UI whether to render the two-row breakdown
 *     or the single legacy line. Reporting must use `project` and
 *     `platform` separately when `isSplit` is true.
 */

export type DealAmounts = {
  value: number | null;
  projectAmount: number | null;
  platformArr: number | null;
};

export type DealAmountDisplay = {
  /** One-time project booking. 0 when the deal uses legacy `value` only. */
  project: number;
  /** Recurring platform booking, annualised. 0 for legacy deals. */
  platform: number;
  /** Sum to display as the deal headline. Equal to `project + platform`
   *  for split deals; equal to legacy `value` (or 0) otherwise. */
  total: number;
  /** True when at least one of the split fields is set. Drives the
   *  two-row "project / platform" UI; reporting must NEVER blend
   *  the two bookings when this is true. */
  isSplit: boolean;
};

export function getDealAmountDisplay(d: DealAmounts): DealAmountDisplay {
  const hasSplit = d.projectAmount !== null || d.platformArr !== null;

  if (hasSplit) {
    const project = d.projectAmount ?? 0;
    const platform = d.platformArr ?? 0;
    return {
      project,
      platform,
      total: project + platform,
      isSplit: true,
    };
  }

  return {
    project: 0,
    platform: 0,
    total: d.value ?? 0,
    isSplit: false,
  };
}

/**
 * Format a deal amount in USD. Returns "—" for zero/null so the UI
 * never renders "$0" by accident (which looks like a real signal).
 * Locale pinned to en-US so server/client renders match regardless of
 * the host's default locale.
 */
export function formatDealAmount(amount: number): string {
  if (!amount) return "—";
  return `$${amount.toLocaleString("en-US")}`;
}
