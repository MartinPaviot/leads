/**
 * CLE-11 — the PAR audit seam.
 *
 * `invokePageAction` (CLE-04) emits a directive and returns BEFORE the action
 * runs; the run happens client-side (CLE-03 runRegisteredAction) and its outcome
 * round-trips as the [[action-result]] envelope to the MODEL. The audit row,
 * though, is server-only metadata (it carries the undo descriptor, which is
 * deliberately kept OUT of the model's context). So the client posts the outcome
 * here, in parallel with the model envelope, right after runRegisteredAction
 * settles (design §2.1).
 *
 * Two cases:
 *  - FORWARD result → log the mutating PAR action (logPageActionCall). Reads
 *    (mutating:false) are NOT logged (AC-2): the client posts nothing for them,
 *    and this route double-checks `mutating === true` before writing.
 *  - REVERSAL result (reconcileEventId present) → the inverse of an earlier
 *    undo ran. On ok:false / action_not_registered the inverse could not run
 *    (page gone), so re-open the original event so it is reversible again (E-3);
 *    on ok:true leave it reverted.
 *
 * Tenant/user scoping is free (same-origin POST, session cookie). The undo
 * descriptor is shaped into a ReversibleSnapshot here so the model never sees it.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import {
  logPageActionCall,
  reopenEvent,
  isValidReversibleSnapshot,
  type ReversibleSnapshot,
} from "@/lib/chat/tool-call-log";
import type { UndoDescriptor } from "@/lib/chat/page-actions/types";

interface PageActionLogBody {
  invocationId?: string;
  actionId?: string;
  params?: Record<string, unknown>;
  ok?: boolean;
  summary?: string;
  error?: string;
  surfaceType?: string;
  threadId?: string;
  /** Manifest flag — the route only audits mutating actions (AC-2). */
  mutating?: boolean;
  /** The action's serializable undo descriptor (Mode A/B), if reversible. */
  undo?: UndoDescriptor;
  /** Present when this is the result of an UNDO's inverse (reconcile path, E-3). */
  reconcileEventId?: string;
}

/**
 * Translate a client UndoDescriptor into the server-side ReversibleSnapshot.
 * - reinvoke → page_action (client-inverse, Mode B).
 * - server   → the embedded snapshot (create/update/delete/..., Mode A).
 * Anything else / absent → null (not reversible).
 */
function descriptorToSnapshot(
  actionId: string,
  undo: UndoDescriptor | undefined,
): ReversibleSnapshot | null {
  if (!undo || typeof undo !== "object") return null;
  if (undo.kind === "reinvoke") {
    if (typeof undo.actionId !== "string" || !undo.actionId) return null;
    return {
      type: "page_action",
      actionId,
      inverse: {
        actionId: undo.actionId,
        params: (undo.params ?? {}) as Record<string, unknown>,
      },
    };
  }
  if (undo.kind === "server") {
    // CLE-11 FOLLOWUPS #2: structurally validate the page's client-asserted
    // server snapshot at WRITE time (discriminant + required fields + entity
    // allowlist) instead of only at reversal. A malformed/forged snapshot is
    // rejected up front (logged as non-undoable) rather than persisted verbatim.
    return isValidReversibleSnapshot(undo.snapshot) ? undo.snapshot : null;
  }
  return null;
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PageActionLogBody;
  try {
    body = (await req.json()) as PageActionLogBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tenantId, userId } = authCtx;

  // Reversal reconcile path (E-3): the inverse of an earlier undo just ran.
  if (body.reconcileEventId) {
    const reverseOk = body.ok === true;
    if (!reverseOk) {
      // The inverse couldn't run (page gone / not registered) → re-open the
      // event so the user can undo it again on the page. No false "undone".
      await reopenEvent(tenantId, userId, body.reconcileEventId);
      return Response.json({ reconciled: true, reopened: true });
    }
    // ok:true → the optimistic "reverted" mark stands.
    return Response.json({ reconciled: true, reopened: false });
  }

  // Forward PAR result. Reads (mutating !== true) are not audited (AC-2).
  if (!body.actionId) {
    return Response.json({ error: "Missing actionId" }, { status: 400 });
  }
  if (body.mutating !== true) {
    return Response.json({ logged: false, reason: "non-mutating" });
  }

  const snapshot = descriptorToSnapshot(body.actionId, body.undo);
  const eventId = await logPageActionCall({
    tenantId,
    userId,
    threadId: body.threadId,
    actionId: body.actionId,
    params: (body.params ?? {}) as Record<string, unknown>,
    ok: body.ok === true,
    summary: body.summary,
    error: body.error,
    surfaceType: body.surfaceType,
    snapshot,
  });

  return Response.json({ logged: true, eventId });
}
