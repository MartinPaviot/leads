/**
 * CLE-11 — cancel a held outbound send within its undo window.
 *
 * The thin HTTP path a UI "Undo" affordance (CLE-05/CLE-15 owns the component)
 * calls; chat-side, `undoLastAction` is the primary surface. BOTH funnel through
 * the SAME atomic transition (cancelHeldOutbound) so there is no divergence: a
 * row is canceled `WHERE id AND tenantId AND status='held'`, which exactly one
 * of {this cancel, the cron release} can win. No cross-tenant cancel.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { cancelHeldOutbound } from "@/lib/emails/outbound-hold";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Missing outbound email id" }, { status: 400 });
  }

  const result = await cancelHeldOutbound(authCtx.tenantId, id);
  if (!result.canceled) {
    // Either already sent/sending, or not this tenant's row — same honest 409
    // either way (we never reveal another tenant's row exists).
    return Response.json(
      { canceled: false, error: "This send is no longer cancelable (already sending or sent)." },
      { status: 409 },
    );
  }
  return Response.json({ canceled: true });
}
