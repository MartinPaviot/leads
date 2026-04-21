import { registerProvider } from "./registry";
import { apolloCompanyEnrichmentProvider } from "./apollo-adapter";
import { llmFallbackCompanyEnrichmentProvider } from "./llm-fallback-adapter";

/**
 * Wire the providers we ship by default. Called lazily from the
 * waterfall on first invocation when the registry is empty. Tests that
 * want deterministic behaviour register their own providers before the
 * first `enrichCompany` call.
 */
export function registerDefaults(): void {
  registerProvider(apolloCompanyEnrichmentProvider);
  registerProvider(llmFallbackCompanyEnrichmentProvider);
}
