import { getAuthContext } from "@/lib/auth/auth-utils";
import { listPendingApprovals, approveCapture, rejectCapture } from "@/lib/capture/approval";

/**
 * GET  /api/inbox/captures — auto-captured interactions awaiting human review
 *   (INBOX-G02, the Lightfield human-in-the-loop approval surface).
 * POST /api/inbox/captures { id, action: "approve" | "reject" } — Add to CRM /
 *   dismiss. Reuses the proven capture-approval backend; tenant + user scoped.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await listPendingApprovals(authCtx.tenantId, 50);
    const captures = rows.map((r) => {
      const a = (r.proposedActivity ?? {}) as { summary?: string; metadata?: Record<string, unknown> };
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        summary: a.summary ?? String(meta.subject ?? "(no subject)"),
        from: String(meta.from ?? ""),
        at: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      };
    });
    return Response.json({ captures });
  } catch (error) {
    console.error("Failed to list pending captures:", error);
    return Response.json({ captures: [] });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, action } = (await req.json().catch(() => ({}))) as { id?: string; action?: string };
    if (!id || (action !== "approve" && action !== "reject")) {
      return Response.json({ error: "Bad request" }, { status: 400 });
    }
    const ok =
      action === "approve"
        ? !!(await approveCapture(authCtx.tenantId, id, authCtx.userId))
        : await rejectCapture(authCtx.tenantId, id, authCtx.userId);
    return Response.json({ ok });
  } catch (error) {
    console.error("Failed to review capture:", error);
    return Response.json({ error: "Failed to review capture" }, { status: 500 });
  }
}
