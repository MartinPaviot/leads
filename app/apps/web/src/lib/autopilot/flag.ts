/**
 * Spec 37 — the daily-autopilot deployment flag, isolated in a pure module so it's
 * unit-testable without dragging the cron's db/inngest imports. The cron
 * (inngest/daily-autopilot.ts) re-exports this. Default OFF: the cron no-ops unless
 * DAILY_AUTOPILOT_ENABLED is exactly "1" or "true".
 */
export function isDailyAutopilotEnabled(): boolean {
  const v = process.env.DAILY_AUTOPILOT_ENABLED;
  return v === "1" || v === "true";
}
