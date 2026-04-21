import type { CompanyEnrichmentProvider } from "./types";

/**
 * In-process registry of company-enrichment providers.
 *
 * Module-load-time registration keeps the provider graph inspectable
 * (no hidden runtime configuration). Tests use `resetRegistryForTest`
 * to swap in mocks between cases.
 */

let providers: CompanyEnrichmentProvider[] = [];
let defaultsLoaded = false;

export function registerProvider(p: CompanyEnrichmentProvider): void {
  // Dedupe by name — re-registration replaces the previous entry rather
  // than silently shadowing. Useful for hot-reload and test overrides.
  providers = providers.filter((existing) => existing.name !== p.name);
  providers.push(p);
}

export function listProviders(): CompanyEnrichmentProvider[] {
  return [...providers].sort((a, b) => a.priority - b.priority);
}

export function listAvailableProviders(): CompanyEnrichmentProvider[] {
  return listProviders().filter((p) => {
    try {
      return p.isAvailable();
    } catch {
      return false;
    }
  });
}

/**
 * Wipe the registry. Test-only — production code should never call
 * this. Named explicitly so accidental invocations are easy to spot
 * in grep.
 */
export function resetRegistryForTest(): void {
  providers = [];
  defaultsLoaded = false;
}

/**
 * Lazy default registration. Called by the waterfall on first use
 * when the registry is empty. Tests that set up their own providers
 * skip this path by calling `registerProvider` before the waterfall.
 */
export async function ensureDefaultsLoaded(): Promise<void> {
  if (defaultsLoaded || providers.length > 0) {
    defaultsLoaded = true;
    return;
  }
  defaultsLoaded = true;
  // Dynamic import so a test that clears the registry doesn't trigger
  // circular init and so Next.js bundling doesn't drag the adapters
  // into every page.
  const { registerDefaults } = await import("./register-defaults");
  registerDefaults();
}
