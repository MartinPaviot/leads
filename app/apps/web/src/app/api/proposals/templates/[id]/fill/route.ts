import { withAuthRLS } from "@/lib/auth/auth-utils";
import { buildProposalFill, FillUnavailable } from "@/lib/proposals/fill";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/proposals/templates/[id]/fill { dealId }
 * Draft a proposal from a mapped template + a deal's info base.
 */
export async function POST(req: Request, { params }: Params) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { dealId?: string };
    if (!body.dealId) {
      return Response.json({ error: "missing_dealId" }, { status: 400 });
    }
    try {
      const result = await buildProposalFill(id, body.dealId, {
        tenantId: authCtx.tenantId,
        userId: authCtx.userId,
      });
      return Response.json(result, { status: 201 });
    } catch (e) {
      if (e instanceof FillUnavailable) {
        const status =
          e.reason === "deal_not_found" ? 404 : e.reason === "template_not_mapped" ? 409 : 422;
        const userSuggestion =
          e.reason === "missing_required_data"
            ? "No language model is configured, so sections could not be drafted. Configure a model and try again."
            : undefined;
        return Response.json({ error: e.reason, message: e.message, userSuggestion }, { status });
      }
      console.error("proposal fill failed", e);
      return Response.json({ error: "fill_failed" }, { status: 500 });
    }
  });
}
