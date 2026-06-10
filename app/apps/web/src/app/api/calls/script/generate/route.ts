/**
 * POST /api/calls/script/generate — LLM-draft a call script from the tenant's
 * product + ICP. When `contactId` is provided, the server rebuilds THIS
 * prospect's evidence from the DB and the generation is grounded on it
 * (cited fail-closed — see tenant-script.filterGroundedProblems). Returns a
 * draft (NOT saved) + grounding notes; the rep reviews/edits then PUTs to
 * /api/calls/script. { sector?, persona?, contactId? }
 */
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { generateCallScript } from "@/lib/call-mode/tenant-script";
import { buildEvidenceForContact } from "@/lib/call-mode/prospect-evidence";

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const body = (await req.json().catch(() => ({}))) as { sector?: string; persona?: string; contactId?: string };
    const evidence = body.contactId
      ? await buildEvidenceForContact(authCtx.tenantId, body.contactId).catch(() => [])
      : [];
    const result = await generateCallScript(authCtx.tenantId, {
      sector: body.sector,
      persona: body.persona,
      evidence,
    });
    if (!result) {
      return Response.json({ error: "No language model configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY." }, { status: 503 });
    }
    return Response.json({ draft: result.draft, grounding: result.grounding });
  });
}
