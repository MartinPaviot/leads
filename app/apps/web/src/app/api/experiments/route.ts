import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import {
  getTenantSettings,
  updateTenantSettings,
} from "@/lib/tenant-settings";
import { KNOWN_FLAGS, getFlagsForTenant } from "@/lib/experiments";

/**
 * Tenant-scoped feature-flag endpoint.
 *
 * GET  → current flag map for the tenant. Unknown keys decode to false.
 * PUT  → admin-only. Body `{ flags: Record<string, boolean> }` merges
 *        into `settings.experiments`. Setting a flag to `null` /
 *        `false` deletes it (so the tenant falls back to default off).
 *
 * Flags not in `KNOWN_FLAGS` are persisted but logged as a warning —
 * this lets us ship reads before writes without breaking the admin
 * UI, but surfaces typos in flag names.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const flags = await getFlagsForTenant(authCtx.tenantId);
  return NextResponse.json({ flags });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = (await req.json().catch(() => ({}))) as {
    flags?: Record<string, boolean | null>;
  };

  if (!body.flags || typeof body.flags !== "object") {
    return NextResponse.json(
      { error: "body.flags must be an object" },
      { status: 400 },
    );
  }

  const settings = await getTenantSettings(authCtx.tenantId);
  const next = { ...(settings.experiments ?? {}) };

  const unknown: string[] = [];
  for (const [key, value] of Object.entries(body.flags)) {
    if (!(KNOWN_FLAGS as readonly string[]).includes(key)) {
      unknown.push(key);
    }
    if (value === null || value === false || value === undefined) {
      delete next[key];
    } else {
      next[key] = !!value;
    }
  }

  await updateTenantSettings(authCtx.tenantId, { experiments: next });

  return NextResponse.json({
    ok: true,
    flags: next,
    ...(unknown.length > 0 ? { unknownFlags: unknown } : {}),
  });
}
