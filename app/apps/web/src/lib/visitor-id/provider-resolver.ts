/**
 * Per-tenant visitor-ID provider resolver (P0-2 follow-up).
 *
 * Lookup chain :
 *  1. `tenants.settings.visitorIdProvider` ("snitcher" | "rb2b" |
 *     "clearbit_reveal" | "none") — explicit per-tenant choice.
 *  2. Default to "snitcher" when settings absent (matches Monaco's
 *     own choice on monaco.com — see Phase 1 teardown).
 *  3. If the resolved provider's `isAvailable()` returns false
 *     (no API key), fall back to a no-op "none" provider so the
 *     worker can short-circuit cleanly without throwing.
 *
 * Pure : the resolver itself takes settings + a provider registry
 * map ; the worker injects the registry. Tests use stub registries
 * to assert routing without touching real providers.
 */

import type { VisitorIdProvider } from "./provider";

export type VisitorIdProviderName =
  | "snitcher"
  | "rb2b"
  | "clearbit_reveal"
  | "none";

export const VALID_PROVIDER_NAMES: ReadonlySet<VisitorIdProviderName> =
  new Set(["snitcher", "rb2b", "clearbit_reveal", "none"]);

/**
 * No-op provider that's always available + always returns null.
 * The resolver falls back to this when the requested provider has
 * no credentials configured. Lets the worker proceed without
 * special-casing "no provider" branches.
 */
export const noneProvider: VisitorIdProvider = {
  name: "none",
  isAvailable() {
    return true;
  },
  async identify() {
    return null;
  },
};

/**
 * Read the per-tenant provider preference from settings. Returns
 * "snitcher" by default (Monaco-aligned) when absent or invalid.
 */
export function resolveProviderName(
  settings: Record<string, unknown> | null | undefined,
): VisitorIdProviderName {
  if (!settings || typeof settings !== "object") return "snitcher";
  const raw = (settings as Record<string, unknown>).visitorIdProvider;
  if (typeof raw !== "string") return "snitcher";
  return VALID_PROVIDER_NAMES.has(raw as VisitorIdProviderName)
    ? (raw as VisitorIdProviderName)
    : "snitcher";
}

/**
 * Provider registry : maps name → instance. Worker constructs once
 * at module load and passes through. The map is read-only by
 * convention.
 */
export type ProviderRegistry = Readonly<
  Record<VisitorIdProviderName, VisitorIdProvider>
>;

/**
 * Pick the right provider for a tenant. Falls back to the "none"
 * provider when the chosen provider lacks credentials — the worker
 * can keep its single happy-path code instead of branching on
 * "what if there's no API key set" everywhere.
 */
export function resolveProvider(args: {
  settings: Record<string, unknown> | null | undefined;
  registry: ProviderRegistry;
}): VisitorIdProvider {
  const name = resolveProviderName(args.settings);
  const candidate = args.registry[name];
  if (candidate && candidate.isAvailable()) return candidate;
  // Try Snitcher as the fallback — Monaco-aligned default.
  if (name !== "snitcher") {
    const snitcher = args.registry.snitcher;
    if (snitcher && snitcher.isAvailable()) return snitcher;
  }
  return args.registry.none ?? noneProvider;
}
