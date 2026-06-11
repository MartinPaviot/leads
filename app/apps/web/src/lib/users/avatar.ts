/**
 * Per-user profile photo — storage + serving helpers.
 *
 * Same storage philosophy as the workspace logo (lib/logo/workspace-logo.ts):
 * the photo bytes live as a small raster data URL in `user_preferences`
 * (resource "profile", key "avatar") so no migration is needed, and the bytes
 * are never inlined into SSR payloads or LLM prompts. `users.avatar_url`
 * carries only the small versioned serving URL built here — which is exactly
 * what the sidebar, the members list and the chat member tools already read.
 */

export const PROFILE_AVATAR_RESOURCE = "profile";
export const PROFILE_AVATAR_KEY = "avatar";

/** Shape of the `user_preferences.value` JSONB for the avatar key. */
export interface ProfileAvatarRecord {
  dataUrl: string;
  updatedAt: string;
}

/** Fail-closed reader for the stored JSONB — anything malformed reads as
 * "no avatar" so the serving route 404s instead of throwing. */
export function parseProfileAvatarRecord(value: unknown): ProfileAvatarRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.dataUrl !== "string" || v.dataUrl.length === 0) return null;
  return {
    dataUrl: v.dataUrl,
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "0",
  };
}

/** Versioned serving URL for a member's profile photo. `?v=` carries the
 * upload timestamp so browsers can cache the response as immutable and
 * still pick up replacements instantly — same scheme as the workspace logo. */
export function profileAvatarServingUrl(appUserId: string, updatedAt?: string): string {
  return `/api/users/${encodeURIComponent(appUserId)}/avatar?v=${encodeURIComponent(updatedAt ?? "0")}`;
}
