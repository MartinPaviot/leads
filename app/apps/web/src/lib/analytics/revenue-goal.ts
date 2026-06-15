/**
 * Pure validation for the revenue-goal input — shared by the
 * POST /api/analytics/revenue-goal route and its unit test. No I/O, so it's
 * testable without auth/db.
 *
 * Returns the monthly goal to store (a non-negative whole number), `null` to
 * clear it, or an `error` message when the input can't be trusted.
 */
export function parseMonthlyGoal(raw: unknown): { monthly: number | null } | { error: string } {
  if (raw === null || raw === undefined || raw === "") return { monthly: null };
  const n = typeof raw === "string" ? Number(raw.replace(/[\s,]/g, "")) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) return { error: "Goal must be a number." };
  if (n < 0) return { error: "Goal can't be negative." };
  if (n > 1_000_000_000) return { error: "Goal is unrealistically large." };
  return { monthly: n === 0 ? null : Math.round(n) };
}
