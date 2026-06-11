import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseWorkspaceLogoDataUrl } from "@/lib/logo/workspace-logo";

/**
 * Serves the workspace logo bytes stored in tenants.settings.logoDataUrl.
 * The URL carries a `?v=<logoUpdatedAt>` cache-buster (see
 * workspaceLogoUrl()), so the response can be cached aggressively —
 * `private` because the logo is tenant-scoped behind auth.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [tenant] = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, authCtx.tenantId))
      .limit(1);

    const settings = (tenant?.settings || {}) as { logoDataUrl?: string | null };
    const parsed = settings.logoDataUrl ? parseWorkspaceLogoDataUrl(settings.logoDataUrl) : null;
    if (!parsed) {
      return Response.json({ error: "No workspace logo" }, { status: 404 });
    }

    return new Response(parsed.bytes, {
      headers: {
        "Content-Type": parsed.mime,
        "Content-Length": String(parsed.bytes.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to serve workspace logo:", error);
    return Response.json({ error: "Failed to load logo" }, { status: 500 });
  }
}
