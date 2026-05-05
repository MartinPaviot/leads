import { getAuthContext } from "@/lib/auth/auth-utils";
import { selectStrategy, StrategyError } from "@/lib/campaign-engine/select-strategy";
import { findWarmPath } from "@/lib/campaign-engine/warm-path";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId");
  const contactId = url.searchParams.get("contactId") || undefined;

  if (!companyId) {
    return Response.json({ error: "companyId query param required" }, { status: 400 });
  }

  try {
    const candidates = await selectStrategy(companyId, authCtx.tenantId, contactId);
    const warmPath = contactId ? await findWarmPath(authCtx.tenantId, contactId) : null;

    return Response.json({
      candidates,
      warmPathAvailable: !!warmPath,
      signalsActive: candidates.flatMap((c) => c.activationFactors).filter((f) => f.includes("signal")),
    });
  } catch (error) {
    if (error instanceof StrategyError && error.code === "BRIEF_NOT_FOUND") {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Strategy selection failed:", error);
    return Response.json({ error: "Strategy selection failed" }, { status: 500 });
  }
}
