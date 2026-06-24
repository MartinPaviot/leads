import { getAuthContext } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { eraseSubjectLive, isDsarEraseEnabled } from "@/lib/compliance/dsar/db-erase";

/**
 * POST /api/gdpr/erase — spec 34 per-subject erasure (right to be forgotten).
 * Distinct from /api/gdpr/delete (the tenant-wide workspace wipe): this erases ONE
 * prospect — the contact + its outbound + activities — and adds a permanent
 * do-not-resurrect suppression. DESTRUCTIVE + GATED: admin capability + an explicit
 * { confirm: "ERASE_SUBJECT" } + the DSAR_ERASE_ENABLED flag (default OFF). Body:
 * { contactId, confirm }.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Admin-only (settings:write), same matrix gate as the tenant-wide delete.
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  if (!isDsarEraseEnabled()) {
    return Response.json({ error: "DSAR erase is disabled", message: "Set DSAR_ERASE_ENABLED to enable per-subject erasure." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== "ERASE_SUBJECT") {
    return Response.json({ error: "Confirmation required", message: 'Send { "confirm": "ERASE_SUBJECT", "contactId": "..." } to erase a subject.' }, { status: 400 });
  }
  if (!body.contactId || typeof body.contactId !== "string") {
    return Response.json({ error: "contactId is required" }, { status: 400 });
  }

  try {
    const result = await eraseSubjectLive(authCtx.tenantId, body.contactId, { requestedById: authCtx.appUserId });
    if (!result.ran) {
      const status = result.reason === "contact_not_found" ? 404 : 403;
      return Response.json({ error: result.reason }, { status });
    }
    return Response.json({ success: true, report: result.report });
  } catch (error) {
    console.error("DSAR erase failed:", error);
    return Response.json({ error: "Erase failed" }, { status: 500 });
  }
}
