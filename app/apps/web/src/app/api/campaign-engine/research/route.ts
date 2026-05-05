import { getAuthContext } from "@/lib/auth/auth-utils";
import { buildIntelligenceBrief } from "@/lib/campaign-engine/build-intelligence-brief";

const inFlight = new Map<string, Promise<unknown>>();

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { companyId, contactId, forceRefresh } = body;

  if (!companyId) {
    return Response.json({ error: "companyId required" }, { status: 400 });
  }

  // Deduplicate concurrent requests for same company
  const key = `${authCtx.tenantId}:${companyId}:${contactId || ""}`;
  if (inFlight.has(key)) {
    return Response.json({ status: "generating", estimatedMs: 30000 }, { status: 202 });
  }

  // Rate limit: max 5 concurrent per tenant
  const tenantCount = [...inFlight.keys()].filter((k) => k.startsWith(authCtx.tenantId)).length;
  if (tenantCount >= 5) {
    return Response.json({ error: "Too many concurrent brief generations" }, { status: 429 });
  }

  const start = Date.now();

  const promise = buildIntelligenceBrief(companyId, authCtx.tenantId, contactId, { forceRefresh });
  inFlight.set(key, promise);

  try {
    const brief = await promise;

    if (!brief) {
      return Response.json({ error: "Company not found" }, { status: 404 });
    }

    return Response.json({
      brief,
      cached: !forceRefresh && Date.now() - start < 500,
      generationTimeMs: Date.now() - start,
    });
  } catch (error) {
    console.error("Brief generation failed:", error);
    return Response.json({ error: "Brief generation failed" }, { status: 500 });
  } finally {
    inFlight.delete(key);
  }
}
