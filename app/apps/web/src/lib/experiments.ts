/**
 * Tenant-scoped feature flags — lightweight, DB-backed, admin-only.
 *
 * Rationale: we don't need LaunchDarkly / Unleash for WS-2's scope —
 * we have ~1 flag to manage (`onboarding.v2.confirmation-card`) and
 * we want Martin to self-serve the ramp. Storing flags in
 * `tenants.settings.experiments` piggybacks on the 5s per-request
 * cache already in tenant-settings, so a flag lookup is effectively
 * free inside a request.
 *
 * Future flags follow the convention `workstream.feature-name`, e.g.
 * `onboarding.v2.confirmation-card`, `onboarding.v2.warm-lead-prompt`.
 */

import { getTenantSettings } from "@/lib/tenant-settings";

/**
 * Canonical list of known flags. Adding a flag here doesn't enable
 * it — FLAG_DEFAULTS below controls the default state when a tenant
 * hasn't explicitly set the flag. Unknown keys (not in KNOWN_FLAGS)
 * decode to `false`, so shipping code that reads a new flag before
 * declaring it here is forwards-safe.
 */
export const KNOWN_FLAGS = [
  "onboarding.v2.confirmation-card",
  "onboarding.v2.warm-lead-prompt",
  "onboarding.v2.tam-reveal-async",
] as const;

export type KnownFlag = (typeof KNOWN_FLAGS)[number];

/**
 * WS-5 — default on for every flag once the post-merge soak closes
 * with no regressions. Existing tenants still win via their explicit
 * `settings.experiments[flag] = false` override; this default only
 * decides behavior when the setting is absent, which is every
 * tenant that hasn't toggled the flag explicitly (i.e. most of them
 * in practice).
 */
export const FLAG_DEFAULTS: Record<KnownFlag, boolean> = {
  "onboarding.v2.confirmation-card": true,
  "onboarding.v2.warm-lead-prompt": true,
  "onboarding.v2.tam-reveal-async": true,
};

/** Read a flag for a specific tenant. Order of precedence:
 *    1. explicit setting in `settings.experiments[flag]`
 *    2. `FLAG_DEFAULTS[flag]`
 *    3. false (unknown flag) */
export async function isFlagEnabled(
  tenantId: string,
  flag: KnownFlag,
): Promise<boolean> {
  const settings = await getTenantSettings(tenantId);
  const experiments = settings.experiments ?? {};
  if (flag in experiments) return !!experiments[flag];
  return FLAG_DEFAULTS[flag] ?? false;
}

/** Read every flag for a tenant — returns the full map. Explicit
 *  settings win; otherwise the flag resolves to its FLAG_DEFAULTS
 *  entry. Used by the `/api/experiments` endpoint so the client
 *  renders a stable shape. */
export async function getFlagsForTenant(
  tenantId: string,
): Promise<Record<KnownFlag, boolean>> {
  const settings = await getTenantSettings(tenantId);
  const experiments = settings.experiments ?? {};
  const out = {} as Record<KnownFlag, boolean>;
  for (const flag of KNOWN_FLAGS) {
    if (flag in experiments) {
      out[flag] = !!experiments[flag];
    } else {
      out[flag] = FLAG_DEFAULTS[flag] ?? false;
    }
  }
  return out;
}
