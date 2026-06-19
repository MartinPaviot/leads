import { getAuthContext } from "@/lib/auth/auth-utils";
import { inngest } from "@/inngest/client";
import { getStyleProposal, saveStyleProposal, clearStyleProposal } from "@/lib/inbox/writing-style";

/**
 * GET / POST / DELETE /api/inbox/writing-style/derive  (B2 R5 — "Fill it up for me!")
 *
 * - POST   enqueue a derive: writes the proposal to "pending" and emits
 *          inbox/writing-style.derive. Idempotent — a POST while already pending
 *          is a no-op (R5.6), so a double-click never enqueues twice.
 * - GET    poll the current proposal (idle | pending | ready | rejected | insufficient).
 * - DELETE dismiss the proposal (R5.4) — the live prompt is never touched here.
 *
 * Accepting a "ready" proposal is a normal PUT to /api/inbox/writing-style with
 * the proposed fields + derivedAt, then a DELETE here to clear it.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ proposal: await getStyleProposal(authCtx.userId) });
}

export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const current = await getStyleProposal(authCtx.userId);
  if (current.status === "pending") {
    return Response.json({ proposal: current, alreadyRunning: true });
  }

  const proposal = await saveStyleProposal(authCtx.userId, {
    status: "pending",
    at: new Date().toISOString(),
  });
  await inngest.send({
    name: "inbox/writing-style.derive",
    data: { userId: authCtx.userId, tenantId: authCtx.tenantId },
  });
  return Response.json({ proposal });
}

export async function DELETE() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await clearStyleProposal(authCtx.userId);
  return Response.json({ proposal: { status: "idle" } });
}
