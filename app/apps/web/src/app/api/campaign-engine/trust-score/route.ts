import { getAuthContext } from "@/lib/auth/auth-utils";
import { getTrustScore } from "@/lib/campaign-engine/trust-score";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getTrustScore(authCtx.tenantId);
  return Response.json(state);
}
