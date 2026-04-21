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
 * it — it just documents which keys the code base reads. Unknown
 * keys decode to `false`, so shipping code that reads a new flag
 * before adding it here is forwards-safe.
 */
export const KNOWN_FLAGS = [
  "onboarding.v2.confirmation-card",
  "onboarding.v2.warm-lead-prompt",
  "onboarding.v2.tam-reveal-async",
] as const;

export type KnownFlag = (typeof KNOWN_FLAGS)[number];

/** Read a flag for a specific tenant. Unknown / missing → false. */
export async function isFlagEnabled(
  tenantId: string,
  flag: KnownFlag,
): Promise<boolean> {
  const settings = await getTenantSettings(tenantId);
  const experiments = settings.experiments ?? {};
  return !!experiments[flag];
}

/** Read every flag for a tenant — returns the full map with unknown
 *  keys defaulting to false. Used by the `/api/experiments` endpoint
 *  so the client renders a stable shape. */
export async function getFlagsForTenant(
  tenantId: string,
): Promise<Record<KnownFlag, boolean>> {
  const settings = await getTenantSettings(tenantId);
  const experiments = settings.experiments ?? {};
  const out = {} as Record<KnownFlag, boolean>;
  for (const flag of KNOWN_FLAGS) {
    out[flag] = !!experiments[flag];
  }
  return out;
}
