/**
 * Pricing-tier state derivation — pure, so the /pricing page can reflect the
 * tenant's REAL current plan (fetched from /api/billing/subscription) instead of
 * a hardcoded "Current Plan" pinned to Free Trial.
 *
 * Plans are ordered trial < starter < pro. The tier matching the plan is the
 * current one (disabled, "Current Plan"); strictly-lower tiers are already owned
 * (disabled, "Included"); strictly-higher tiers are upgrades (the tier's own CTA,
 * enabled). When the plan is unknown (still loading or fetch failed) NO tier is
 * marked current — we never render the wrong marker.
 */

const RANK: Record<string, number> = { trial: 0, starter: 1, pro: 2 };

export function planRank(plan: string | null | undefined): number {
  return plan != null && plan in RANK ? RANK[plan] : -1;
}

/** Map a display tier name ("Free Trial", "Starter", "Pro") to a plan key. */
export function tierKey(tierName: string): string {
  const n = tierName.toLowerCase();
  if (n.includes("trial") || n.includes("free")) return "trial";
  if (n.includes("starter")) return "starter";
  if (n.includes("pro")) return "pro";
  return n;
}

export interface TierState {
  label: string;
  disabled: boolean;
  isCurrent: boolean;
  /** true when this tier is a real upgrade the tenant can buy. */
  isUpgrade: boolean;
}

export function tierState(
  tierName: string,
  currentPlan: string | null | undefined,
  defaultCta: string,
): TierState {
  // Unknown plan (loading / failed): static CTA, never a current marker.
  if (currentPlan == null) {
    return { label: defaultCta, disabled: false, isCurrent: false, isUpgrade: true };
  }
  const key = tierKey(tierName);
  if (key === currentPlan) {
    return { label: "Current Plan", disabled: true, isCurrent: true, isUpgrade: false };
  }
  if (planRank(key) <= planRank(currentPlan)) {
    return { label: "Included", disabled: true, isCurrent: false, isUpgrade: false };
  }
  return { label: defaultCta, disabled: false, isCurrent: false, isUpgrade: true };
}
