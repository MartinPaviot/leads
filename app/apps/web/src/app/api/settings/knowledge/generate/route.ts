import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { runCompanyIntake } from "@/lib/knowledge/company-intake";

/**
 * POST /api/settings/knowledge/generate — industrialised company intake:
 * read the tenant's website (or an explicit URL) and upsert the FDAE-style
 * Knowledge sections (lib/knowledge/company-intake.ts). Admin-gated like
 * every workspace-scope knowledge write; rate-limited as an LLM call.
 * Body: { url?: string, extraUrls?: string[], dryRun?: boolean }.
 */

// Fetching up to ~6 pages + one extraction pass can exceed the default
// budget on slow sites.
export const maxDuration = 180;

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    extraUrls?: string[];
    dryRun?: boolean;
  };

  let url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    const settings = await getTenantSettings(authCtx.tenantId);
    const domain = (settings.companyDomain ?? "").trim();
    if (!domain) {
      return Response.json(
        { error: "No URL provided and no company domain configured (Settings → ICP)." },
        { status: 400 },
      );
    }
    url = domain;
  }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const extraUrls = Array.isArray(body.extraUrls)
    ? body.extraUrls.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u)).slice(0, 3)
    : [];

  const result = await runCompanyIntake({
    tenantId: authCtx.tenantId,
    userId: authCtx.userId,
    url,
    extraUrls,
    dryRun: body.dryRun === true,
  });

  return Response.json(result, { status: result.ok ? 200 : 422 });
}
