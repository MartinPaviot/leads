import { withAuthRLS } from "@/lib/auth/auth-utils";
import { listProposals } from "@/lib/tam/proposals";

/**
 * GET /api/tam/proposals?status=pending&kind=add&limit=100
 * Lists the TAM proposal queue (default: pending) + per-status counts
 * for the review surface.
 */
export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const kind = url.searchParams.get("kind") || undefined;
    const limit = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10)),
    );
    const { proposals, counts } = await listProposals(authCtx.tenantId, {
      status,
      kind,
      limit,
    });
    return Response.json({ proposals, counts });
  });
}
