import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, userPreferences } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { isValidWorkspaceLogoDataUrl } from "@/lib/logo/workspace-logo";
import {
  PROFILE_AVATAR_RESOURCE,
  PROFILE_AVATAR_KEY,
  profileAvatarServingUrl,
} from "@/lib/users/avatar";

/**
 * PUT /api/account/avatar — set or remove the signed-in user's profile photo.
 *
 *   body: { avatarDataUrl: string }  → set (client rasterizes to ≤256px first)
 *   body: { avatarDataUrl: null }    → remove (back to the initials bubble)
 *
 * Deliberately NOT gated on a role permission: every member — viewers
 * included — owns their photo. Validation reuses the workspace-logo rules
 * (raster-only, ≤300 KB, SVG rejected fail-closed). The bytes land in
 * `user_preferences` and `users.avatar_url` gets the small versioned
 * serving URL, so list payloads and the session stay tiny.
 */
export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (!("avatarDataUrl" in body)) {
    return Response.json({ error: "avatarDataUrl required (string or null)" }, { status: 400 });
  }
  const { avatarDataUrl } = body as { avatarDataUrl: unknown };

  try {
    if (avatarDataUrl === null) {
      await db
        .delete(userPreferences)
        .where(
          and(
            eq(userPreferences.userId, authCtx.userId),
            eq(userPreferences.resource, PROFILE_AVATAR_RESOURCE),
            eq(userPreferences.key, PROFILE_AVATAR_KEY),
          ),
        );
      await db
        .update(users)
        .set({ avatarUrl: null, updatedAt: new Date() })
        .where(eq(users.id, authCtx.appUserId));
      return Response.json({ avatarUrl: null });
    }

    if (typeof avatarDataUrl !== "string" || !isValidWorkspaceLogoDataUrl(avatarDataUrl)) {
      return Response.json(
        { error: "Photo must be a PNG, JPEG or WebP image under 300 KB" },
        { status: 400 },
      );
    }

    const updatedAt = new Date().toISOString();
    const record = { dataUrl: avatarDataUrl, updatedAt };

    // Upsert — the unique index (user_id, resource, key) makes this safe.
    // Same select-then-write idiom as /api/user-preferences.
    const [existing] = await db
      .select({ id: userPreferences.id })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, authCtx.userId),
          eq(userPreferences.resource, PROFILE_AVATAR_RESOURCE),
          eq(userPreferences.key, PROFILE_AVATAR_KEY),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(userPreferences)
        .set({ value: record, updatedAt: new Date() })
        .where(eq(userPreferences.id, existing.id));
    } else {
      await db.insert(userPreferences).values({
        userId: authCtx.userId,
        resource: PROFILE_AVATAR_RESOURCE,
        key: PROFILE_AVATAR_KEY,
        value: record,
      });
    }

    const avatarUrl = profileAvatarServingUrl(authCtx.appUserId, updatedAt);
    await db
      .update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.id, authCtx.appUserId));

    return Response.json({ avatarUrl });
  } catch (error) {
    console.error("Failed to update profile photo:", error);
    return Response.json({ error: "Failed to update photo" }, { status: 500 });
  }
}
