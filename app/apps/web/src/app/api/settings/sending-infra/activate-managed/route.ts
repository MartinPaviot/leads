import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { updateTenantSettings } from "@/lib/config/tenant-settings";
import { loadTenantCapacity, dnsAwareAuthResolver } from "@/lib/autopilot/capacity-source";
import { activateManagedSending } from "@/lib/sending/identity/activate-managed-sending";

/**
 * POST /api/settings/sending-infra/activate-managed
 *
 * Flips the tenant to `elevay-managed-active` — the cold-allowing mode — but ONLY when
 * a DNS-authenticated Elevay-owned sending domain already exists for the tenant (a
 * `smtp_custom` mailbox passing SPF/DKIM/DMARC). The completion of the managed-setup
 * flow: `request-managed` tickets it, ops provisions + authenticates the domain, then
 * this activates cold sending. Refuses (409) otherwise so cold can never be enabled
 * without a real authenticated Elevay domain.
 *
 * Auth resolution is FORCED to the DNS-aware resolver here (independent of the
 * MANAGED_DOMAIN_DNS_VERIFY rollout flag) — activation must always verify DNS.
 */
export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const result = await activateManagedSending(authCtx.tenantId, {
    loadCapacity: (tenantId) => loadTenantCapacity(tenantId, { resolveAuth: dnsAwareAuthResolver }),
    setMode: (tenantId, mode) => updateTenantSettings(tenantId, { sendingMailboxMode: mode }),
  });

  return NextResponse.json(
    { ok: result.activated, mode: result.activated ? "elevay-managed-active" : undefined, ...result },
    { status: result.activated ? 200 : 409 },
  );
}
