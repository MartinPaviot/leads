import { getAuthContext } from "@/lib/auth/auth-utils";
import { assetStoreFor, copyContextForTenant } from "@/lib/copy/assets/db-store";
import { saveAssetVersion } from "@/lib/copy/assets/store";
import { ASSET_KINDS, type AssetKind, type Lang } from "@/lib/copy/assets/resolve";

/**
 * Spec 18 — the workspace's copy building blocks.
 *
 * GET  /api/copy/assets?lang=en|fr&campaignId= — resolved current CopyContext
 *      (assets + voice) the copy engine reads. Tenant-scoped.
 * POST /api/copy/assets { lang, kind, content, campaignId? } — save a new asset
 *      version (append-only; supersedes the prior current row for the scope).
 */

function parseLang(v: string | null | undefined): Lang | null {
  return v === "en" || v === "fr" ? v : null;
}

export async function GET(request: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const lang = parseLang(sp.get("lang")) ?? "en";
  const campaignId = sp.get("campaignId");

  try {
    const context = await copyContextForTenant(authCtx.tenantId, { lang, campaignId });
    return Response.json({ lang, campaignId: campaignId ?? null, context });
  } catch (error) {
    console.error("Failed to load copy assets:", error);
    return Response.json({ error: "Failed to load copy assets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const lang = parseLang(body.lang);
  if (!lang) return Response.json({ error: "lang must be 'en' or 'fr'" }, { status: 400 });
  if (!ASSET_KINDS.includes(body.kind)) return Response.json({ error: `kind must be one of ${ASSET_KINDS.join(", ")}` }, { status: 400 });
  if (typeof body.content !== "string" || !body.content.trim()) return Response.json({ error: "content is required" }, { status: 400 });

  try {
    const block = await saveAssetVersion(
      assetStoreFor(),
      { tenantId: authCtx.tenantId, campaignId: body.campaignId ?? null, lang, kind: body.kind as AssetKind, content: body.content },
      () => crypto.randomUUID(),
    );
    return Response.json({ saved: block });
  } catch (error) {
    console.error("Failed to save copy asset:", error);
    return Response.json({ error: "Failed to save copy asset" }, { status: 500 });
  }
}
