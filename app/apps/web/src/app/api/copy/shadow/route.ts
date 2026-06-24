import { getAuthContext } from "@/lib/auth/auth-utils";
import { generateShadowCopy } from "@/lib/copy/personalization/db-shadow";
import type { Lang } from "@/lib/copy/personalization/generate-message";

/**
 * POST /api/copy/shadow { contactId, lang?, campaignId? } — spec 19/20 on-demand.
 * Generates one grounded copy sample for a real prospect (assets+voice from the
 * spec-18 store + cited evidence from the prospect context) and stores it for
 * comparison. The shadow NEVER sends; it's the data to judge a cutover. Gated by
 * COPY_ENGINE_SHADOW (the route 403s when off). Tenant-scoped.
 */
export async function POST(request: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!body.contactId || typeof body.contactId !== "string") {
    return Response.json({ error: "contactId is required" }, { status: 400 });
  }
  const lang: Lang = body.lang === "fr" ? "fr" : "en";

  try {
    const result = await generateShadowCopy(body.contactId, authCtx.tenantId, { lang, campaignId: body.campaignId ?? null });
    if (!result.ran) {
      const status = result.reason === "copy_shadow_disabled" ? 403 : 404;
      return Response.json({ error: result.reason }, { status });
    }
    return Response.json({ sample: result.message, evidenceCount: result.evidenceCount });
  } catch (error) {
    console.error("Copy shadow generation failed:", error);
    return Response.json({ error: "Shadow generation failed" }, { status: 500 });
  }
}
