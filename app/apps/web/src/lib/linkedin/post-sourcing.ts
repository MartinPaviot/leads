/**
 * Spec 36 (T11) — source WARM LEADS from post engagement. The people who react
 * to / comment on a post (the founder's own, or any post they can see) are warm,
 * intent-rich leads. We pull them via the read primitives, upsert each as a
 * canonical contact (provider "unipile", deduped on the normalized linkedin_url),
 * and stamp the engagement so the contact carries WHY it was sourced.
 *
 * Cheap: reactions/comments are LIST reads (a couple of calls + cursor pages),
 * NOT per-engager profile views — so this doesn't touch the seat's ~100 view/day
 * budget. Companies that engage are skipped (no personal /in/ URL → no contact).
 *
 * Server-only (DB + live Unipile). The engager→contact mapping is pure + tested.
 */

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { upsertContact } from "@/db/canonical/upsert";
import { linkedinPath } from "@/db/canonical/identity";
import {
  listUnipilePostReactions,
  listUnipilePostComments,
  listUnipileUserPosts,
  type UnipileConfig,
} from "@/lib/providers/unipile/http";

const UNIPILE = "unipile";

export interface EngagerInput {
  name?: string | null;
  headline?: string | null;
  profileUrl?: string | null;
}

export interface EngagerContactFields {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  /** Normalized bare path — the dedup key shared with Apollo / Sales-Nav sourcing. */
  linkedinUrl: string;
}

/**
 * Pure: an engager (reactor / commenter) → canonical contact fields. Returns
 * null for anyone without a personal `/in/` URL — i.e. companies (their URL is
 * `/company/…`) and hashed / out-of-network actors — so only real people leads
 * are sourced.
 */
export function engagerToContact(e: EngagerInput): EngagerContactFields | null {
  const linkedinUrl = linkedinPath(e.profileUrl ?? null);
  // Only PERSONAL profiles (/in/<handle>) become contacts — linkedinPath keeps the
  // whole path, so a /company/ or /school/ URL would otherwise be sourced as a person.
  if (!linkedinUrl || !/(^|\/)in\/[^/]+/.test(linkedinUrl)) return null;
  const name = (e.name ?? "").trim();
  const parts = name ? name.split(/\s+/) : [];
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
    title: e.headline?.trim() || null,
    linkedinUrl,
  };
}

export interface PostEngagementResult {
  reactionsScanned: number;
  commentsScanned: number;
  contactsUpserted: number;
  skippedNoIdentity: number;
}

interface SourceCtx {
  tenantId: string;
  unipileAccountId: string;
}

/**
 * Source every engager on ONE post into the CRM as a warm-lead contact, stamping
 * `properties.linkedinEngagement`. `postSocialId` is the post's social_id URN
 * (e.g. `urn:li:ugcPost:…` / `urn:li:activity:…`) — the numeric id 404s.
 */
export async function sourceEngagersFromPost(
  cfg: UnipileConfig,
  ctx: SourceCtx,
  postSocialId: string,
  opts: { maxResults?: number; seen?: Set<string> } = {},
): Promise<PostEngagementResult> {
  const max = opts.maxResults ?? 200;
  // Caller may pass a shared `seen` so an engager active on several of the owner's
  // posts is sourced once (accurate unique count; first post wins the stamp).
  const seen = opts.seen ?? new Set<string>();
  const r: PostEngagementResult = { reactionsScanned: 0, commentsScanned: 0, contactsUpserted: 0, skippedNoIdentity: 0 };
  const observedAt = new Date();

  const upsertEngager = async (input: EngagerInput, kind: "reaction" | "comment", value: string | null) => {
    const fields = engagerToContact(input);
    if (!fields) { r.skippedNoIdentity++; return; }
    if (seen.has(fields.linkedinUrl)) return; // de-dupe within the run
    seen.add(fields.linkedinUrl);
    const contact = await upsertContact(ctx.tenantId, {
      linkedinUrl: fields.linkedinUrl,
      firstName: fields.firstName,
      lastName: fields.lastName,
      title: fields.title,
      provider: UNIPILE,
      observedAt,
    });
    if (contact) {
      const patch = { linkedinEngagement: { postId: postSocialId, kind, value, observedAt: observedAt.toISOString() } };
      await db
        .update(contacts)
        .set({ properties: sql`coalesce(${contacts.properties}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
        .where(and(eq(contacts.id, contact.id), eq(contacts.tenantId, ctx.tenantId)));
      r.contactsUpserted++;
    }
  };

  // Reactions (clean typed author).
  let cursor: string | null = null;
  while (r.reactionsScanned < max) {
    const page = await listUnipilePostReactions(cfg, postSocialId, ctx.unipileAccountId, {
      cursor: cursor ?? undefined,
      limit: Math.min(50, max - r.reactionsScanned),
    });
    for (const item of page.items) {
      r.reactionsScanned++;
      await upsertEngager(
        { name: item.author?.name, headline: item.author?.headline, profileUrl: item.author?.profile_url },
        "reaction",
        item.value ?? null,
      );
    }
    cursor = page.cursor ?? null;
    if (!cursor || page.items.length === 0) break;
  }

  // Comments (name in `author` string; the rich object in `author_details`).
  cursor = null;
  while (r.commentsScanned < max) {
    const page = await listUnipilePostComments(cfg, postSocialId, ctx.unipileAccountId, {
      cursor: cursor ?? undefined,
      limit: Math.min(50, max - r.commentsScanned),
    });
    for (const item of page.items) {
      r.commentsScanned++;
      const details = (item.author_details ?? {}) as { headline?: string; profile_url?: string };
      await upsertEngager(
        { name: typeof item.author === "string" ? item.author : undefined, headline: details.headline, profileUrl: details.profile_url },
        "comment",
        null,
      );
    }
    cursor = page.cursor ?? null;
    if (!cursor || page.items.length === 0) break;
  }

  return r;
}

export interface OwnPostsEngagementResult extends PostEngagementResult {
  postsScanned: number;
}

/**
 * Source the engagers across the seat owner's OWN recent posts — the robust,
 * no-URL-parsing path (each post's social_id comes straight from the API).
 * "Who is engaging with my content" → warm leads in the CRM.
 */
export async function sourceEngagersFromOwnRecentPosts(
  cfg: UnipileConfig,
  ctx: SourceCtx,
  ownProviderId: string,
  opts: { maxPosts?: number; maxPerPost?: number } = {},
): Promise<OwnPostsEngagementResult> {
  const posts = await listUnipileUserPosts(cfg, ownProviderId, ctx.unipileAccountId, { limit: opts.maxPosts ?? 5 });
  const totals: OwnPostsEngagementResult = {
    postsScanned: 0,
    reactionsScanned: 0,
    commentsScanned: 0,
    contactsUpserted: 0,
    skippedNoIdentity: 0,
  };
  // One shared de-dupe set across all posts → each unique engager upserted once.
  const seen = new Set<string>();
  for (const p of posts.items) {
    const sid = p.social_id ?? p.id;
    if (!sid) continue;
    totals.postsScanned++;
    const r = await sourceEngagersFromPost(cfg, ctx, String(sid), { maxResults: opts.maxPerPost ?? 200, seen });
    totals.reactionsScanned += r.reactionsScanned;
    totals.commentsScanned += r.commentsScanned;
    totals.contactsUpserted += r.contactsUpserted;
    totals.skippedNoIdentity += r.skippedNoIdentity;
  }
  return totals;
}
