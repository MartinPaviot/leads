/**
 * Spec 21 — admin warmup control. POST enable/disable warmup for a client tenant's
 * Instantly mailboxes; GET reads their per-mailbox warmup status. Gated by the
 * Elevay operator session (isAdminAuthenticated / ADMIN_SECRET) — this acts on
 * OTHER tenants' decrypted keys, so it must never be reachable without the gate.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../lib/admin-auth";
import { runTenantWarmup, getTenantMailboxWarmup } from "../../../lib/warmup-ops";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { tenantId?: string; action?: string };
  if (!body.tenantId || (body.action !== "enable" && body.action !== "disable")) {
    return NextResponse.json({ error: "tenantId + action ('enable'|'disable') required" }, { status: 400 });
  }
  const result = await runTenantWarmup(body.tenantId, body.action);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }
  return NextResponse.json(await getTenantMailboxWarmup(tenantId));
}
