/**
 * Unipile client — remaining social actions: create a post, list followers /
 * following, edit own profile. Completes the Posts + Users tags. (followers/
 * following currently return 501 for LinkedIn — wrapped for parity; they will
 * work once Unipile implements them.)
 */
import { unipileFetch, unipileMultipart, type UnipileConfig, type UnipileList, type UnipileFilePart } from "./http";

export interface CreatePostInput {
  accountId: string;
  text: string;
  mentions?: Array<{ name: string; profile_id: string; is_company?: boolean }>;
  externalLink?: string;
  asOrganization?: string;
  location?: string;
  /** A post id to repost. */
  repost?: string;
  attachments?: UnipileFilePart[];
}

/** POST /posts — publish a post (multipart; attachments optional). */
export function createPost(cfg: UnipileConfig, input: CreatePostInput): Promise<{ object?: string; post_id?: string }> {
  const fields: Record<string, unknown> = {
    account_id: input.accountId,
    text: input.text,
    mentions: input.mentions,
    external_link: input.externalLink,
    as_organization: input.asOrganization,
    location: input.location,
    repost: input.repost,
  };
  return unipileMultipart(cfg, "POST", "/posts", fields, (input.attachments ?? []).map((part) => ({ field: "attachments", part })));
}

/** GET /users/followers — a profile's followers (501 for LinkedIn today). */
export function listFollowers(cfg: UnipileConfig, accountId: string, opts: { userId?: string; limit?: number; cursor?: string } = {}): Promise<UnipileList<Record<string, unknown>>> {
  const q = new URLSearchParams({ account_id: accountId });
  if (opts.userId) q.set("user_id", opts.userId);
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  return unipileFetch(cfg, "GET", `/users/followers?${q.toString()}`);
}

/** GET /users/following — accounts a profile follows (501 for LinkedIn today). */
export function listFollowing(cfg: UnipileConfig, accountId: string, userId: string, opts: { limit?: number; cursor?: string } = {}): Promise<UnipileList<Record<string, unknown>>> {
  const q = new URLSearchParams({ account_id: accountId, user_id: userId });
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  return unipileFetch(cfg, "GET", `/users/following?${q.toString()}`);
}

export interface EditOwnProfileInput {
  accountId: string;
  headline?: string;
  summary?: string;
  location?: Record<string, unknown>;
  skills?: string[];
  skillsFollow?: boolean;
  openToWork?: Record<string, unknown>;
  customLink?: Record<string, unknown>;
  /** Profile/cover picture file parts. */
  picture?: UnipileFilePart;
  coverPicture?: UnipileFilePart;
}

/** PATCH /users/me/edit — edit the connected seat's own LinkedIn profile (multipart). */
export function editOwnProfile(cfg: UnipileConfig, input: EditOwnProfileInput): Promise<{ object?: string }> {
  const fields: Record<string, unknown> = {
    type: "LINKEDIN",
    account_id: input.accountId,
    headline: input.headline,
    summary: input.summary,
    location: input.location,
    skills: input.skills,
    skills_follow: input.skillsFollow,
    open_to_work: input.openToWork,
    custom_link: input.customLink,
  };
  const files: Array<{ field: string; part: UnipileFilePart }> = [];
  if (input.picture) files.push({ field: "picture", part: input.picture });
  if (input.coverPicture) files.push({ field: "cover_picture", part: input.coverPicture });
  return unipileMultipart(cfg, "PATCH", "/users/me/edit", fields, files);
}
