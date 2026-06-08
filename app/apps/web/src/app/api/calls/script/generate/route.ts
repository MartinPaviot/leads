/**
 * POST /api/calls/script/generate — LLM-draft a call script from the tenant's
 * product + ICP. Returns a draft (NOT saved); the rep reviews/edits then PUTs
 * to /api/calls/script. { sector?, persona? }
 */
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { generateCallScript } from "@/lib/call-mode/tenant-script";

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const body = (await req.json().catch(() => ({}))) as { sector?: string; persona?: string };
    const draft = await generateCallScript(authCtx.tenantId, { sector: body.sector, persona: body.persona });
    if (!draft) {
      return Response.json({ error: "No language model configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY." }, { status: 503 });
    }
    return Response.json({ draft });
  });
}
