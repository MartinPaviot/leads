/**
 * Sending-identity guardrail — every outbound email routes through
 * this helper before the transport layer. Protects the user's primary
 * domain from being torched by cold outreach, and routes overflow to
 * the WS-6 scaling-path prompt.
 *
 * Motivation (master brief §2.1 criterion 2 + WS-6 rationale): once
 * the user connects their primary Gmail/Outlook, the cheapest path
 * for us is to send everything from there. That's also the fastest
 * way to damage their deliverability permanently. This helper
 * enforces the "warm follow-ups only, capped daily, from primary"
 * rule until the user explicitly upgrades.
 */

import type { TenantSettings } from "@/lib/tenant-settings";

export type SendingMailboxMode = NonNullable<TenantSettings["sendingMailboxMode"]>;

export interface SendingEnforcementInput {
  mode: SendingMailboxMode;
  /** True when the contact has no prior conversation history with the
   *  tenant — the archetypal cold-outreach case. Computed by the
   *  caller, because only the caller knows which activity table to
   *  query (sync emails vs sent sequences). */
  isCold: boolean;
  /** Number of sends already dispatched from the primary inbox today
   *  (calendar day, tenant-local). */
  sentTodayFromPrimary: number;
  /** Cap from tenant settings. Passed explicitly so the helper stays
   *  pure and unit-testable. */
  sendingDailyCapPrimary: number;
  /** When true, cold outreach from the primary inbox is allowed
   *  regardless of the default rail. Users opt into this in Settings
   *  > Sending infrastructure. */
  sendingAllowColdOnPrimary: boolean;
}

/** Why a send was blocked — drives the WS-6 scaling-path UX. */
export type SendingBlockReason =
  | "cold-on-primary-blocked"
  | "primary-cap-hit"
  | "managed-setup-pending"
  | "no-provider-connected";

export interface SendingEnforcementDecision {
  /** Whether the caller may proceed with the send. */
  allowed: boolean;
  /** When `allowed === true`, which transport to dispatch through. */
  provider: "primary" | "external" | "managed" | null;
  /** When `allowed === false`, why — drives WS-6 prompt. */
  blockReason: SendingBlockReason | null;
  /** Structured hint for the WS-6 `<ScalingPathPrompt>`. Truthy means
   *  "this block should open the scaling conversation". False for
   *  blocks the user can't do anything about right now
   *  (e.g. pending managed-setup). */
  scalingPath: boolean;
  /** Human-readable reason — logged, optionally surfaced. */
  reason: string;
}

export function enforceSendingIdentity(
  input: SendingEnforcementInput,
): SendingEnforcementDecision {
  const {
    mode,
    isCold,
    sentTodayFromPrimary,
    sendingDailyCapPrimary,
    sendingAllowColdOnPrimary,
  } = input;

  switch (mode) {
    case "primary-with-caps": {
      // Cold outreach default-blocked. The user can override via
      // `sendingAllowColdOnPrimary`, but the rail is closed by default
      // so a fresh tenant can't accidentally torch their domain.
      if (isCold && !sendingAllowColdOnPrimary) {
        return {
          allowed: false,
          provider: null,
          blockReason: "cold-on-primary-blocked",
          scalingPath: true,
          reason:
            "Cold outreach from the primary inbox is disabled. " +
            "Connect a dedicated sender or request Elevay-managed setup.",
        };
      }

      // Cap check — once hit, no more sends today regardless of warm
      // vs cold. Surfaces the scaling-path prompt because the cap
      // itself is the signal that the user needs more capacity.
      if (sentTodayFromPrimary >= sendingDailyCapPrimary) {
        return {
          allowed: false,
          provider: null,
          blockReason: "primary-cap-hit",
          scalingPath: true,
          reason: `Daily cap of ${sendingDailyCapPrimary} sends from primary inbox reached.`,
        };
      }

      return {
        allowed: true,
        provider: "primary",
        blockReason: null,
        scalingPath: false,
        reason: "primary-with-caps: warm + under cap",
      };
    }

    case "external-connected": {
      // External providers don't share the primary domain's
      // deliverability risk, so cold + volume aren't gated here —
      // they're the provider's concern.
      return {
        allowed: true,
        provider: "external",
        blockReason: null,
        scalingPath: false,
        reason: "external-connected: routing to third-party sender",
      };
    }

    case "elevay-managed-active": {
      return {
        allowed: true,
        provider: "managed",
        blockReason: null,
        scalingPath: false,
        reason: "elevay-managed-active: routing to managed sending domain",
      };
    }

    case "elevay-managed-requested": {
      // User asked for managed setup but it's not provisioned yet.
      // We can still send warm + under-cap from primary as a bridge;
      // cold attempts wait for the managed setup.
      if (isCold) {
        return {
          allowed: false,
          provider: null,
          blockReason: "managed-setup-pending",
          scalingPath: false,
          reason:
            "Elevay-managed sending setup is still in progress. Warm follow-ups send from primary; cold outreach pauses until setup completes.",
        };
      }
      if (sentTodayFromPrimary >= sendingDailyCapPrimary) {
        return {
          allowed: false,
          provider: null,
          blockReason: "primary-cap-hit",
          scalingPath: false,
          reason: `Daily primary cap ${sendingDailyCapPrimary} reached; managed setup still pending.`,
        };
      }
      return {
        allowed: true,
        provider: "primary",
        blockReason: null,
        scalingPath: false,
        reason: "elevay-managed-requested: bridge via primary for warm + under cap",
      };
    }

    default: {
      // Exhaustive-check — if a future mode slips in without a
      // case branch, refuse rather than guess.
      const _exhaustive: never = mode;
      void _exhaustive;
      return {
        allowed: false,
        provider: null,
        blockReason: "no-provider-connected",
        scalingPath: false,
        reason: `Unknown sendingMailboxMode: ${mode}`,
      };
    }
  }
}
