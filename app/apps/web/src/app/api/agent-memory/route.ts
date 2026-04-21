import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { buildMemorySnapshot } from "@/lib/agent-memory";
import { updateTenantSettings, getTenantSettings } from "@/lib/tenant-settings";

/**
 * GET /api/agent-memory
 *
 * Returns the aggregated memory snapshot for the current tenant.
 * On first call, flips `agentMemoryPanelDiscovered = true` — the
 * T2+T4 gate flag that unlocks progressive-autonomy nudges (WS-1).
 *
 * Query params:
 *   format=json (default) — returns the snapshot.
 *
 * The full GDPR export + nuclear delete live under sub-paths so the
 * GET default stays fast.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await buildMemorySnapshot(authCtx.tenantId);

  // T2+T4 — first open of the panel flips the gate so WS-1's nudge
  // engine is allowed to surface suggestions. Idempotent — the helper
  // only writes when the flag is absent/false.
  try {
    const settings = await getTenantSettings(authCtx.tenantId);
    if (!settings.agentMemoryPanelDiscovered) {
      await updateTenantSettings(authCtx.tenantId, {
        agentMemoryPanelDiscovered: true,
      });
    }
  } catch (err) {
    // Never fail the GET on a telemetry-side write.
    console.warn("agent-memory: panel-discovered flip failed", err);
  }

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "json") {
    // Already JSON-shaped; this branch is explicit so the endpoint
    // stays stable if other formats (CSV) are added later.
    return NextResponse.json(snapshot);
  }
  return NextResponse.json(snapshot);
}
