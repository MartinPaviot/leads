/**
 * Spec 36 (T7) — resolve the concrete LinkedInPort the orchestration
 * (runLinkedInAction) dispatches through, from env. This is the wiring seam:
 * `LINKEDIN_OUTREACH_PROVIDER=unipile` selects the live Unipile adapter,
 * `heyreach` keeps the existing adapter, anything else (or missing config)
 * returns null so the caller fails closed (no accidental sends — today's
 * behavior via sequence-dispatch/linkedin-adapter.ts:23).
 */

import type { LinkedInPort } from "./port";
import { UnipileAdapter, type TargetResolver } from "@/lib/providers/unipile/linkedin-adapter";
import { unipileMessagingClient } from "@/lib/providers/unipile/messaging-client";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { HeyReachAdapter, type HeyReachClient } from "@/lib/providers/heyreach/linkedin-adapter";

export type LinkedInProvider = "unipile" | "heyreach" | "none";

/** The configured provider (lowercased env), defaulting to "none". */
export function selectedLinkedInProvider(): LinkedInProvider {
  const p = process.env.LINKEDIN_OUTREACH_PROVIDER?.trim().toLowerCase();
  return p === "unipile" || p === "heyreach" ? p : "none";
}

export interface BuildLinkedInPortOptions {
  /** Resolves a contact → Unipile provider_id (+ chat/degree). Required for Unipile. */
  resolveTarget: TargetResolver;
  /** Injected HeyReach client when provider=heyreach. */
  heyReachClient?: HeyReachClient;
  /** Optional provider-side campaign grouping (HeyReach). */
  campaignId?: string;
}

/**
 * Build the active LinkedInPort, or null when no usable provider is configured
 * (unset flag, or unipile selected but UNIPILE_API_KEY/DSN missing). Callers
 * treat null as "LinkedIn sending unavailable" and refuse rather than send.
 */
export function buildLinkedInPort(opts: BuildLinkedInPortOptions): LinkedInPort | null {
  const provider = selectedLinkedInProvider();

  if (provider === "unipile") {
    const cfg = readUnipileConfig();
    if (!cfg) return null;
    return new UnipileAdapter(unipileMessagingClient(cfg), opts.resolveTarget);
  }

  if (provider === "heyreach" && opts.heyReachClient) {
    return new HeyReachAdapter(opts.heyReachClient, opts.campaignId);
  }

  return null;
}
