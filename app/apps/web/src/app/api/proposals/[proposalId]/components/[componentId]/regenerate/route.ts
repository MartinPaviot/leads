import { withAuthRLS } from "@/lib/auth/auth-utils";
import { regenerateComponent, FillUnavailable } from "@/lib/proposals/fill";

type Params = { params: Promise<{ proposalId: string; componentId: string }> };

/**
 * POST /api/proposals/[proposalId]/components/[componentId]/regenerate { guidance? }
 * Re-draft a single component during proofread (PROPOSAL-004), re-grade, persist.
 */
export async function POST(req: Request, { params }: Params) {
  return withAuthRLS(async (authCtx) => {
    const { proposalId, componentId } = await params;
    const body = (await req.json().catch(() => ({}))) as { guidance?: string };
    try {
      const result = await regenerateComponent(proposalId, componentId, {
        tenantId: authCtx.tenantId,
        guidance: typeof body.guidance === "string" ? body.guidance.slice(0, 500) : undefined,
      });
      return Response.json(result);
    } catch (e) {
      if (e instanceof FillUnavailable) {
        const status =
          e.reason === "deal_not_found" ? 404 : e.reason === "template_not_mapped" ? 409 : 422;
        const userSuggestion =
          e.reason === "missing_required_data"
            ? "No language model is configured, so the section could not be re-drafted."
            : undefined;
        return Response.json({ error: e.reason, message: e.message, userSuggestion }, { status });
      }
      console.error("regenerate failed", e);
      return Response.json({ error: "regenerate_failed" }, { status: 500 });
    }
  });
}
