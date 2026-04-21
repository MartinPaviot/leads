import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { reverseAgentAction } from "@/lib/agent-actions";

/**
 * POST /api/agent-actions/:id/reverse
 *
 * Flips a scheduled-but-not-yet-executed OR recently-executed
 * reversible action to `reversed`. Triggers a negative trust event
 * via `recordAutonomyEvent({ eventType: "undone_after_send" })`.
 *
 * Response:
 *   200 { status: "reversed", previousStatus: "scheduled" | "executed" }
 *   404 { status: "not-found" }
 *   409 { status: "too-late", reason: string }
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const result = await reverseAgentAction({
    actionId: id,
    reversedByUserId: authCtx.userId,
    tenantId: authCtx.tenantId,
  });

  if (result.status === "not-found") {
    return NextResponse.json(result, { status: 404 });
  }
  if (result.status === "too-late") {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
