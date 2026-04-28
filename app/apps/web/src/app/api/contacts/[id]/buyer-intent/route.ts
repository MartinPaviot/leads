import { getAuthContext } from "@/lib/auth-utils";
import { scoreBuyerIntent } from "@/lib/scoring/buyer-intent";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const score = await scoreBuyerIntent(id, authCtx.tenantId);
    return Response.json({ score });
  } catch (error) {
    console.error("Failed to compute buyer intent score:", error);
    return Response.json(
      { error: "Failed to compute buyer intent score" },
      { status: 500 },
    );
  }
}
