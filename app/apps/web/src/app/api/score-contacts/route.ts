/**
 * POST /api/score-contacts — score contacts against the ICP profiles
 * ("Score all contacts" in the contacts header More menu).
 *
 * Body: { contactIds: string[] } for a specific set, or { all: true }
 * for the whole tenant. The tenant-wide run loops server-side in
 * batches of 100 (pure SQL, synchronous) — a client fan-out of 20-id
 * chunks would trip the per-user rate limit and take minutes.
 *
 * Replaces the legacy flat-settings composite (seniority keywords +
 * targetRoles): contacts.score is now the 0-100 mirror of the primary
 * ICP fit, computed by lib/scoring/contact-icp-fit with the same
 * criteria engine as the company matrix. The sync + campaign jobs
 * write through the same lib, so the column has ONE meaning.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import {
  hasContactScorableCriteria,
  scoreAllContactsIcp,
  scoreContactIcpBatch,
  CONTACT_SCORE_BATCH_SIZE,
} from "@/lib/scoring/contact-icp-fit";

// Tenant-wide runs walk every contact in SQL batches; give the route
// the same budget as the other long synchronous routes (tam/build,
// enrich/stream) instead of the platform default.
export const maxDuration = 300;

/** Hard ceiling on an explicit id list (5 server batches). Larger sets
 *  are REJECTED — never silently truncated — callers that want
 *  everything send { all: true }. */
const MAX_EXPLICIT_IDS = CONTACT_SCORE_BATCH_SIZE * 5;

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("bulk", authCtx.userId);
  if (rlResponse) return rlResponse;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      contactIds?: unknown;
      all?: unknown;
    };
    const all = body.all === true;
    const contactIds = Array.isArray(body.contactIds)
      ? (body.contactIds.filter((v): v is string => typeof v === "string") as string[])
      : null;

    if (!all && (!contactIds || contactIds.length === 0)) {
      return Response.json(
        { error: "contactIds array or all:true required" },
        { status: 400 },
      );
    }
    if (!all && contactIds && contactIds.length > MAX_EXPLICIT_IDS) {
      return Response.json(
        {
          error: `Too many ids (${contactIds.length} > ${MAX_EXPLICIT_IDS}). Send all:true to score every contact.`,
        },
        { status: 400 },
      );
    }

    // Same spirit as the company guard (R3.4), but contact-scoped:
    // person_seniorities counts as scorable here. Tell the user what
    // to fix instead of writing a tenant full of zeros.
    const activeIcps = await loadActiveIcps(authCtx.tenantId);
    if (!hasContactScorableCriteria(activeIcps)) {
      return Response.json(
        {
          error:
            "Nothing to score yet — add criteria to an active ICP profile in Settings → ICP first.",
        },
        { status: 422 },
      );
    }

    if (all) {
      const r = await scoreAllContactsIcp(authCtx.tenantId, activeIcps);
      return Response.json({ success: true, scored: r.scored, total: r.total });
    }

    const ids = contactIds!;
    const { scored } = await scoreContactIcpBatch(authCtx.tenantId, ids, activeIcps);
    return Response.json({ success: true, scored, total: ids.length });
  } catch (error) {
    console.error("Contact scoring failed:", error);
    return Response.json({ error: "Contact scoring failed" }, { status: 500 });
  }
}
