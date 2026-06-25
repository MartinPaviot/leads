/**
 * Runtime kill-switches for autonomous AI subsystems.
 *
 * Each background spender (coaching, agent-reactor, world-model, ...) reads its
 * own `*_ENABLED` env var through this helper. Enabled by DEFAULT — set the var
 * to "0", "off", or "false" (case-insensitive) to disable that subsystem
 * WITHOUT a redeploy or pulling the API key. This complements the global
 * AI_DISABLED switch (see `@/lib/ai/ai-provider`): AI_DISABLED stops everything,
 * these flags stop one subsystem at a time so the founder can shed cost
 * selectively (e.g. keep chat, kill the nightly deal-revival drafts).
 */
export function isFeatureEnabled(envValue: string | undefined): boolean {
  if (envValue == null) return true;
  const v = envValue.trim().toLowerCase();
  return v !== "0" && v !== "off" && v !== "false";
}
