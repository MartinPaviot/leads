/**
 * Flip a tenant to `elevay-managed-active` sending mode — the mode that ALLOWS cold
 * autopilot sends, routed (at the transport) through owner-SMTP from the tenant's
 * Elevay-owned sending domain. `enforceSendingIdentity` already returns allowed:true
 * for this mode; the ONLY thing missing was a safe product path to SET it (no code
 * did — it was reachable only by a manual DB write). This is that path.
 *
 * SAFETY GATE (the whole point): activation is REFUSED unless the tenant already has a
 * DNS-authenticated Elevay-owned sending domain — i.e. a `smtp_custom` mailbox whose
 * SPF/DKIM/DMARC pass (so it contributes sendable capacity under the DNS-aware
 * resolver). You can NEVER enable cold-from-Elevay-infra without a real, authenticated
 * Elevay domain — so flipping the mode can't accidentally torch a wrong/primary box.
 *
 * The caller MUST inject a `loadCapacity` that uses the DNS-aware resolver (so the
 * smtp_custom box is actually DNS-verified, not trusted on faith).
 */

import type { CapacityReport } from "@/lib/sending/identity/capacity";

/** The provider that represents an Elevay-owned, Elevay-SMTP-sent domain. */
export const ELEVAY_OWNED_PROVIDER = "smtp_custom";

export interface ActivateManagedDeps {
  /** MUST resolve auth via the DNS-aware resolver, so smtp_custom capacity = DNS-verified. */
  loadCapacity: (tenantId: string) => Promise<CapacityReport>;
  setMode: (tenantId: string, mode: "elevay-managed-active") => Promise<void>;
}

export interface ActivateManagedResult {
  activated: boolean;
  /** Sendable capacity from DNS-authenticated Elevay-owned domains. */
  elevayCapacity: number;
  reason: string;
}

export async function activateManagedSending(
  tenantId: string,
  deps: ActivateManagedDeps,
): Promise<ActivateManagedResult> {
  const cap = await deps.loadCapacity(tenantId);
  const elevayCapacity = cap.byProvider[ELEVAY_OWNED_PROVIDER] ?? 0;

  if (elevayCapacity <= 0) {
    return {
      activated: false,
      elevayCapacity,
      reason:
        "Refused: no DNS-authenticated Elevay-owned sending domain. Provision a dedicated " +
        "smtp_custom domain and publish SPF (-all) / DKIM (>=2048) / DMARC (quarantine|reject) first.",
    };
  }

  await deps.setMode(tenantId, "elevay-managed-active");
  return {
    activated: true,
    elevayCapacity,
    reason: `Activated elevay-managed-active: ${elevayCapacity} sendable from Elevay-owned domain(s).`,
  };
}
