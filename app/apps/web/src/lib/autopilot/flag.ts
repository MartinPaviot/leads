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

/**
 * AUTOPILOT-AUTOPAUSE three-stage mode (mirrors spec-31's observe-first philosophy):
 *   off     — do nothing (default).
 *   shadow  — detect dead sequences + notify the owner, but do NOT change status.
 *   enforce — also flip dead sequences to status='paused'.
 * Independent of DAILY_AUTOPILOT_ENABLED so the circuit-breaker can be turned on
 * (and observed in shadow) BEFORE the autopilot itself is flipped on.
 */
export type AutoPauseMode = "off" | "shadow" | "enforce";

export function autoPauseMode(): AutoPauseMode {
  const v = (process.env.AUTOPILOT_AUTOPAUSE_MODE ?? "").toLowerCase();
  return v === "shadow" || v === "enforce" ? v : "off";
}
