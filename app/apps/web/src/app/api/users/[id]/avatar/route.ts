import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, userPreferences } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { parseWorkspaceLogoDataUrl } from "@/lib/logo/workspace-logo";
import {
  PROFILE_AVATAR_RESOURCE,
  PROFILE_AVATAR_KEY,
  parseProfileAvatarRecord,
} from "@/lib/users/avatar";

/**
 * Serves a workspace member's profile photo bytes (stored in
 * user_preferences, see lib/users/avatar.ts). [id] is the APP user id
 * (users.id) — what the members API and users.avatar_url traffic in.
 *
 * Tenant-scoped: the target must belong to the requester's workspace,
 * otherwise 404 (no existence leak across tenants). The URL carries a
 * `?v=<updatedAt>` cache-buster so the response is cached as immutable —
 * same scheme as the workspace logo route.
 */
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
    const [target] = await db
      .select({ clerkId: users.clerkId })
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!target) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const [pref] = await db
      .select({ value: userPreferences.value })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, target.clerkId),
          eq(userPreferences.resource, PROFILE_AVATAR_RESOURCE),
          eq(userPreferences.key, PROFILE_AVATAR_KEY),
        ),
      )
      .limit(1);

    const record = parseProfileAvatarRecord(pref?.value);
    const parsed = record ? parseWorkspaceLogoDataUrl(record.dataUrl) : null;
    if (!parsed) {
      return Response.json({ error: "No profile photo" }, { status: 404 });
    }

    return new Response(parsed.bytes, {
      headers: {
        "Content-Type": parsed.mime,
        "Content-Length": String(parsed.bytes.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to serve profile photo:", error);
    return Response.json({ error: "Failed to load photo" }, { status: 500 });
  }
}
