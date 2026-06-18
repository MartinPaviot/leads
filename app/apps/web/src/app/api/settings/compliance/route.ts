import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import {
  getTenantSettings,
  updateTenantSettings,
} from "@/lib/config/tenant-settings";

/**
 * DPA status + GDPR compliance endpoint.
 *
 * GET  /api/settings/compliance
 *   Returns the current DPA status per sub-processor and GDPR-relevant
 *   settings (contactCreationMode, backsyncRange, doNotTrackDomains,
 *   defaultDataVisibility).
 *
 * PUT  /api/settings/compliance
 *   Admin-only. Updates DPA status per sub-processor. Accepts a partial
 *   `dpaStatus` object — only the keys provided are overwritten.
 *
 * Sub-processors tracked: anthropic, neon, resend, recall, stripe.
 * Each value is one of: "not_started" | "requested" | "signed".
 */

const DPA_PROVIDERS = ["anthropic", "neon", "resend", "recall", "stripe"] as const;
type DpaProvider = (typeof DPA_PROVIDERS)[number];
type DpaStatusValue = "not_started" | "requested" | "signed";

const VALID_DPA_STATUSES: DpaStatusValue[] = ["not_started", "requested", "signed"];

const DEFAULT_DPA_STATUS: Record<DpaProvider, DpaStatusValue> = {
  anthropic: "not_started",
  neon: "not_started",
  resend: "not_started",
  recall: "not_started",
  stripe: "not_started",
};

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getTenantSettings(authCtx.tenantId);
    const dpaStatus = settings.dpaStatus ?? DEFAULT_DPA_STATUS;

    return Response.json({
      dpaStatus,
      gdpr: {
        contactCreationMode: settings.contactCreationMode ?? "selective",
        backsyncRange: settings.backsyncRange ?? "3m",
        doNotTrackDomains: settings.doNotTrackDomains ?? [],
        defaultDataVisibility: settings.defaultDataVisibility ?? "everyone",
      },
    });
  } catch (error) {
    console.error("Failed to fetch compliance settings:", error);
    return Response.json(
      { error: "Failed to fetch compliance settings" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;
  // CLE-12 — belt-and-braces matrix gate on the fresh DB role (settings:write).
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const incoming = body.dpaStatus;

    if (!incoming || typeof incoming !== "object") {
      return Response.json(
        { error: "dpaStatus object required" },
        { status: 400 },
      );
    }

    // Validate: only known providers, only valid status values.
    for (const [key, value] of Object.entries(incoming)) {
      if (!DPA_PROVIDERS.includes(key as DpaProvider)) {
        return Response.json(
          { error: `Unknown DPA provider: ${key}. Valid: ${DPA_PROVIDERS.join(", ")}` },
          { status: 400 },
        );
      }
      if (!VALID_DPA_STATUSES.includes(value as DpaStatusValue)) {
        return Response.json(
          {
            error: `Invalid status "${value}" for ${key}. Valid: ${VALID_DPA_STATUSES.join(", ")}`,
          },
          { status: 400 },
        );
      }
    }

    const settings = await getTenantSettings(authCtx.tenantId);
    const currentDpa = settings.dpaStatus ?? DEFAULT_DPA_STATUS;
    const merged = { ...currentDpa, ...incoming };

    await updateTenantSettings(authCtx.tenantId, { dpaStatus: merged });

    return Response.json({ success: true, dpaStatus: merged });
  } catch (error) {
    console.error("Failed to update compliance settings:", error);
    return Response.json(
      { error: "Failed to update compliance settings" },
      { status: 500 },
    );
  }
}
