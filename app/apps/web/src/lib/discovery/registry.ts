/**
 * Discovery-source registry. Mirrors the enrichment registry: lazy
 * default registration, priority ordering, availability filtering.
 */
import type { DiscoverySource } from "./types";
import { apolloDiscoverySource, pappersDiscoverySource } from "./sources";

const registry = new Map<string, DiscoverySource>();
let defaultsLoaded = false;

export function registerDiscoverySource(s: DiscoverySource): void {
  registry.set(s.name, s);
}

export function registerDiscoveryDefaults(): void {
  registerDiscoverySource(apolloDiscoverySource);
  registerDiscoverySource(pappersDiscoverySource);
}

function ensureDefaults(): void {
  if (defaultsLoaded || registry.size > 0) return;
  registerDiscoveryDefaults();
  defaultsLoaded = true;
}

/** All registered sources, lowest priority first. */
export function listDiscoverySources(): DiscoverySource[] {
  ensureDefaults();
  return [...registry.values()].sort((a, b) => a.priority - b.priority);
}

/** Only the sources whose config is present (env keys). */
export function listAvailableDiscoverySources(): DiscoverySource[] {
  return listDiscoverySources().filter((s) => s.isAvailable());
}

/** Test seam. */
export function resetDiscoveryRegistryForTest(): void {
  registry.clear();
  defaultsLoaded = false;
}
