import { getAuthContext } from "@/lib/auth/auth-utils";
import { compareCampaigns } from "@/lib/analytics/ab/db-ab";
import type { AbMetric } from "@/lib/analytics/ab/ab";

/**
 * GET /api/analytics/ab?a=<campaignId>&b=<campaignId>&metric=reply|positive —
 * spec 30. Judges whether one of two campaigns is a statistically significant
 * winner (two-proportion z-test, min sample + alpha guards) over the last 30
 * days of outbound_emails. Tenant-scoped, read-only, no winner on thin data.
 */
export async function GET(request: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const a = searchParams.get("a");
  const b = searchParams.get("b");
  if (!a || !b) {
    return Response.json({ error: "Both ?a and ?b campaign ids are required" }, { status: 400 });
  }

  const metricParam = searchParams.get("metric");
  if (metricParam && metricParam !== "reply" && metricParam !== "positive") {
    return Response.json({ error: "metric must be 'reply' or 'positive'" }, { status: 400 });
  }
  const metric = (metricParam ?? undefined) as AbMetric | undefined;

  try {
    const result = await compareCampaigns(authCtx.tenantId, a, b, { metric });
    return Response.json(result);
  } catch (error) {
    console.error("Failed to compare campaigns A/B:", error);
    return Response.json({ error: "Failed to compare campaigns" }, { status: 500 });
  }
}
