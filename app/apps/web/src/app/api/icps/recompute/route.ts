/**
 * POST /api/icps/recompute — user-triggered tenant-wide re-score
 * ("Score all accounts" in the accounts header More menu).
 *
 * Fires the same `icp/recompute-tenant` event the nightly cron, the
 * ICP editor save and the TAM build use, so the manual path walks the
 * identical per-tenant-serialized Inngest run (batches of 100,
 * resumable). The caller then polls GET /api/icps/recompute-status
 * until `lastIcpRecompute.at` postdates the click and shows the
 * regrade diff.
 *
 * Unlike the side-effect senders (fire-and-forget `.catch(() => {})`),
 * the send IS the action here — a failed enqueue must surface as an
 * error, not a fake "started".
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { inngest } from "@/inngest/client";
import { loadActiveIcps, hasScorableCriteria } from "@/lib/icp/fit-recompute-core";

export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit("bulk", authCtx.userId);
  if (rl) return rl;

  // Same guard as the job itself (R3.4): a tenant with no scorable
  // company criteria is skipped silently by the recompute — tell the
  // user what to fix instead of pretending a run started.
  const activeIcps = await loadActiveIcps(authCtx.tenantId);
  if (!hasScorableCriteria(activeIcps)) {
    return Response.json(
      {
        error:
          "Nothing to score yet — add company criteria to an active ICP profile in Settings → ICP first.",
      },
      { status: 422 },
    );
  }

  try {
    await inngest.send({
      name: "icp/recompute-tenant",
      data: { tenantId: authCtx.tenantId },
    });
  } catch (err) {
    console.error("icps/recompute: failed to enqueue", err);
    return Response.json(
      { error: "Could not start the re-score job. Try again in a moment." },
      { status: 502 },
    );
  }

  return Response.json({ started: true, icps: activeIcps.length });
}
