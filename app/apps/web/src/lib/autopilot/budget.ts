/**
 * Spec 37 (B1.2) — daily-autopilot budget resolver. PURE: turns the tenant's
 * configured target + the legacy guardrail floor + the warmup-aware sendable
 * capacity + what's already gone out today into the per-channel budget for THIS
 * run. The loop never exceeds warmup-safe capacity nor the per-tenant cap.
 *
 * Capacity comes from getSendableCapacity (capacity.ts) which already clamps each
 * mailbox to its warmup ramp — we only take `totalAvailable` here (kept structural
 * so this module stays dependency-free + pure). LinkedIn is reserved at 0 until the
 * Unipile channel is enabled (R7.2).
 *
 * Blast radius: lib/autopilot/* only.
 */

export interface ChannelBudget {
  email: number;
  linkedin: number;
}

const finite = (n: number, fallback = 0): number => (Number.isFinite(n) ? n : fallback);

/**
 * Coerce a raw `dailyAutopilotBudget` setting into a usable config budget.
 * Accepts 0 (a deliberate per-tenant pause). Anything non-numeric, non-finite,
 * or negative falls back to `fallback` (the global default, 100). Fractions are
 * floored — you can't enroll half a prospect.
 */
export function coerceConfigBudget(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
}

/**
 * email = max(0, floor(min(configBudget, maxEmailsPerDay ?? configBudget,
 *                          capacity.totalAvailable)) - max(0, spentToday))
 * linkedin = 0 (reserved).
 */
export function resolveAutopilotBudget(args: {
  /** Per-tenant daily target (dailyAutopilotBudget setting, default 100). */
  configBudget: number;
  /** Legacy guardrail floor (autonomy-defaults maxEmailsPerDay, default 40); honoured when lower. */
  maxEmailsPerDay?: number | null;
  /** Warmup-aware sendable capacity for the tenant today. */
  capacity: { totalAvailable: number };
  /** Autopilot sends already enrolled/spent for this tenant today (idempotency). */
  spentToday: number;
}): ChannelBudget {
  const config = finite(args.configBudget, 0);
  const floor = args.maxEmailsPerDay == null ? config : finite(args.maxEmailsPerDay, config);
  const capacity = finite(args.capacity?.totalAvailable, 0);
  const spent = Math.max(0, finite(args.spentToday, 0));

  const ceiling = Math.floor(Math.min(config, floor, capacity));
  const email = Math.max(0, ceiling - spent);
  return { email, linkedin: 0 };
}
