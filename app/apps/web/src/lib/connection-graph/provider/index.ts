/**
 * Provider resolver (_specs/CONNECTION-GRAPH).
 *
 * THE single gate. When the feature is disabled (prod default) this
 * returns null and every caller no-ops — nothing can reach LinkedIn.
 * When enabled, it constructs the configured vendor implementation.
 */

import { configuredGraphProviderId, isConnectionGraphEnabled } from "../config";
import type { LinkedInGraphProvider } from "./types";
import { UnipileGraphProvider, unipileConfigFromEnv } from "./unipile";

export type { LinkedInGraphProvider, RelationPage, SharedConnections } from "./types";

/**
 * Resolve the active provider, or null when the feature is off / no
 * provider is configured. The mock provider is never auto-resolved here
 * (tests construct it directly) — only real providers are wired.
 */
export function resolveGraphProvider(): LinkedInGraphProvider | null {
  if (!isConnectionGraphEnabled()) return null;

  switch (configuredGraphProviderId()) {
    case "unipile":
      return new UnipileGraphProvider(unipileConfigFromEnv());
    // "self_hosted" reserved for a CloakBrowser + Playwright worker.
    default:
      return null;
  }
}
