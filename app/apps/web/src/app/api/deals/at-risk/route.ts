import { getAuthContext } from "@/lib/auth-utils";
import { predictStalls } from "@/lib/analysis/stall-predictor";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const predictions = await predictStalls(authCtx.tenantId);
    return Response.json({
      predictions,
      summary: {
        total: predictions.length,
        highRisk: predictions.filter((p) => p.stallProbability >= 0.7).length,
        mediumRisk: predictions.filter(
          (p) => p.stallProbability >= 0.4 && p.stallProbability < 0.7,
        ).length,
        lowRisk: predictions.filter(
          (p) => p.stallProbability >= 0.3 && p.stallProbability < 0.4,
        ).length,
      },
    });
  } catch (error) {
    console.error("Failed to predict deal stalls:", error);
    return Response.json(
      { error: "Failed to predict deal stalls" },
      { status: 500 },
    );
  }
}
