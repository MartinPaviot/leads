export type MomentumLevel = "high" | "medium" | "low" | "none";

/**
 * Calculate account momentum based on activity volume and recency.
 *
 * @param activitiesCount - Number of activities in the last 7 days
 * @param daysSinceLastActivity - Days since the most recent activity
 * @returns Momentum level: high, medium, low, or none
 */
export function getMomentum(
  activitiesCount: number,
  daysSinceLastActivity: number
): MomentumLevel {
  if (activitiesCount === 0) return "none";
  if (activitiesCount >= 5 && daysSinceLastActivity <= 7) return "high";
  if (activitiesCount >= 2 && daysSinceLastActivity <= 7) return "medium";
  return "low";
}

export const MOMENTUM_STYLES: Record<MomentumLevel, string> = {
  high: "bg-green-500/20 text-green-400",
  medium: "bg-amber-500/20 text-amber-400",
  low: "bg-gray-500/20 text-gray-400",
  none: "bg-[#1e1f2a] text-[#5a5a70]",
};
