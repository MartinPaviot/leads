import type { ContactEnrichmentProvider } from "./types";

/**
 * In-process registry of contact-enrichment providers. Mirrors
 * company-enrichment/registry.ts: module-load registration, dedupe by
 * name, lazy defaults, test reset.
 */

let providers: ContactEnrichmentProvider[] = [];
let defaultsLoaded = false;

export function registerContactProvider(p: ContactEnrichmentProvider): void {
  providers = providers.filter((existing) => existing.name !== p.name);
  providers.push(p);
}

export function listContactProviders(): ContactEnrichmentProvider[] {
  return [...providers].sort((a, b) => a.priority - b.priority);
}

export function listAvailableContactProviders(): ContactEnrichmentProvider[] {
  return listContactProviders().filter((p) => {
    try {
      return p.isAvailable();
    } catch {
      return false;
    }
  });
}

/** Test-only. Wipes the registry so a test can install mock providers. */
export function resetContactRegistryForTest(): void {
  providers = [];
  defaultsLoaded = false;
}

/** Lazy default registration — called by the waterfall on first use. */
export async function ensureContactDefaultsLoaded(): Promise<void> {
  if (defaultsLoaded || providers.length > 0) {
    defaultsLoaded = true;
    return;
  }
  defaultsLoaded = true;
  const { registerContactDefaults } = await import("./register-defaults");
  registerContactDefaults();
}
