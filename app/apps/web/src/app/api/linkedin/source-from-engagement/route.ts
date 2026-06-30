import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { requireCapability } from "@/lib/auth/permissions";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { readUnipileConfig, getUnipileOwnProfile } from "@/lib/providers/unipile/http";
import {
  sourceEngagersFromPost,
  sourceEngagersFromOwnRecentPosts,
  type PostEngagementResult,
  type OwnPostsEngagementResult,
} from "@/lib/linkedin/post-sourcing";
import { rematchStoredRelations } from "@/lib/sending/linkedin/graph-sync";
import logger from "@/lib/observability/logger";

/**
 * POST /api/linkedin/source-from-engagement — spec 36 (T11): source the people
 * engaging with a post as warm-lead contacts (provider "unipile", canonical),
 * stamping `properties.linkedinEngagement`, then re-match the seat's relation
 * snapshot so warm paths light up.
 *
 * Body:
 *   - { postSocialId } → that one post (social_id URN), or
 *   - {} / { maxPosts } → the seat owner's OWN recent posts (default, robust:
 *     no URL parsing — each post's social_id comes from the API).
 *   - maxResults / maxPerPost cap the run.
 *
 * Gated `outbound:send` (member self-serve, same posture as /api/linkedin/source).
 * Works on any connected seat (reactions/comments are not Sales-Nav-only).
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireCapability(authCtx.role, "outbound:send");
  if (denied) return denied;

  const cfg = readUnipileConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Unipile is not configured. Set UNIPILE_API_KEY and UNIPILE_DSN." }, { status: 503 });
  }

  const rows = await db
    .select({
      status: linkedinAccount.status,
      unipileAccountId: linkedinAccount.unipileAccountId,
      userId: linkedinAccount.userId,
    })
    .from(linkedinAccount)
    .where(eq(linkedinAccount.tenantId, authCtx.tenantId))
    .orderBy(desc(linkedinAccount.updatedAt));
  const seat =
    rows.find((r) => r.status === "connected" && r.unipileAccountId && r.userId === authCtx.userId) ??
    rows.find((r) => r.status === "connected" && r.unipileAccountId) ??
    null;
  if (!seat?.unipileAccountId) {
    return NextResponse.json({ error: "Connect a LinkedIn seat first (Settings → Sending infrastructure)." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    postSocialId?: string;
    maxResults?: number;
    maxPosts?: number;
    maxPerPost?: number;
  };
  const ctx = { tenantId: authCtx.tenantId, unipileAccountId: seat.unipileAccountId };
  const clamp = (v: unknown, def: number, hi: number) => Math.min(hi, Math.max(1, Math.floor(Number(v)) || def));

  try {
    let result: PostEngagementResult | OwnPostsEngagementResult;
    if (typeof body.postSocialId === "string" && body.postSocialId.trim()) {
      result = await sourceEngagersFromPost(cfg, ctx, body.postSocialId.trim(), { maxResults: clamp(body.maxResults, 200, 500) });
    } else {
      const me = await getUnipileOwnProfile(cfg, seat.unipileAccountId);
      if (!me.provider_id) {
        return NextResponse.json({ error: "Could not resolve the connected seat's own profile." }, { status: 502 });
      }
      result = await sourceEngagersFromOwnRecentPosts(cfg, ctx, me.provider_id, {
        maxPosts: clamp(body.maxPosts, 5, 20),
        maxPerPost: clamp(body.maxPerPost, 200, 500),
      });
    }

    // Light up warm paths on the freshly-sourced engagers (snapshot match, no Unipile calls).
    let warmEdges = 0;
    try {
      const warm = await rematchStoredRelations(authCtx.tenantId);
      warmEdges = warm.edgesCreated + warm.edgesUpdated;
    } catch (e) {
      logger.warn("linkedin/source-from-engagement: warm-path rematch failed (non-fatal)", { e });
    }
    return NextResponse.json({ ok: true, ...result, warmEdges });
  } catch (err) {
    logger.error("linkedin/source-from-engagement: failed", { tenantId: authCtx.tenantId, err });
    return NextResponse.json({ error: "Engagement sourcing failed. Check the seat is still connected." }, { status: 502 });
  }
}
