/**
 * Spec 36 (T1) — resolve a contact's LinkedIn profileUrl to a Unipile
 * provider_id, viewer-scoped to the sending seat, cached in
 * linkedin_provider_identity. Feeds the UnipileAdapter's TargetResolver.
 *
 * provider_id is opaque + viewer-scoped (resolve with the SAME account that
 * sends) and is NEVER a canonical identity (vendor-id rule) — it lives only in
 * the cache table. Pure helpers (identifier extraction, profile parse, degree
 * mapping) are unit-tested; the cache+fetch orchestration is integration glue.
 */

import { db } from "@/db";
import { linkedinProviderIdentity } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { linkedinPath } from "@/db/canonical/identity";
import { getUnipileUserProfile, type UnipileConfig, type UnipileUserProfile } from "./http";
import type { ResolvedTarget, TargetResolver } from "./linkedin-adapter";
import type { LinkedInRequest } from "@/lib/sending/linkedin/port";

/** The /in/<handle> segment of a LinkedIn URL — Unipile's public identifier. */
export function publicIdentifierFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/in\/([^/?#]+)/i);
  if (!m) return null;
  const id = decodeURIComponent(m[1]).trim().toLowerCase();
  return id || null;
}

/** Map Unipile network_distance / is_relationship to a degree label. */
export function degreeFromProfile(p: UnipileUserProfile): "1st" | "2nd" | "3rd" | null {
  const nd = (p.network_distance ?? "").toUpperCase();
  if (p.is_relationship === true || nd.includes("1") || nd.includes("FIRST")) return "1st";
  if (nd.includes("2") || nd.includes("SECOND")) return "2nd";
  if (nd.includes("3") || nd.includes("THIRD")) return "3rd";
  return null;
}

export interface ParsedProfile {
  providerId: string | null;
  degree: "1st" | "2nd" | "3rd" | null;
}

/** Extract the send target (provider_id) + degree from a profile response. */
export function parseUserProfile(p: UnipileUserProfile): ParsedProfile {
  const providerId = (p.provider_id ?? p.id ?? "").trim() || null;
  return { providerId, degree: degreeFromProfile(p) };
}

export interface ResolveCtx {
  tenantId: string;
  /** Our linkedin_account.id — the cache FK. */
  linkedinAccountId: string;
  /** The Unipile account_id — the viewer the id is resolved against. */
  unipileAccountId: string;
  cfg: UnipileConfig;
}

interface ResolveContact {
  id: string;
  profileUrl?: string | null;
}

/**
 * Resolve (cache-first) a contact → provider_id for the given seat. Returns
 * null when the contact has no usable LinkedIn URL or the lookup yields no id.
 */
export async function resolveProviderId(ctx: ResolveCtx, contact: ResolveContact): Promise<ResolvedTarget | null> {
  // 1) Cache hit (keyed by seat + contact).
  const [cached] = await db
    .select({
      providerId: linkedinProviderIdentity.providerId,
      chatId: linkedinProviderIdentity.chatId,
      degree: linkedinProviderIdentity.connectionDegree,
    })
    .from(linkedinProviderIdentity)
    .where(
      and(
        eq(linkedinProviderIdentity.linkedinAccountId, ctx.linkedinAccountId),
        eq(linkedinProviderIdentity.contactId, contact.id),
      ),
    )
    .limit(1);
  if (cached?.providerId) {
    return { providerId: cached.providerId, chatId: cached.chatId, degree: cached.degree };
  }

  // 2) Resolve live with the sending account (viewer-scoped).
  const identifier = publicIdentifierFromUrl(contact.profileUrl);
  if (!identifier) return null;

  let parsed: ParsedProfile;
  try {
    parsed = parseUserProfile(await getUnipileUserProfile(ctx.cfg, identifier, ctx.unipileAccountId));
  } catch {
    return null; // a failed resolution is a no-profile-class refusal upstream
  }
  if (!parsed.providerId) return null;

  // 3) Persist the cache (idempotent on the seat+contact unique).
  const normalizedUrl = linkedinPath(contact.profileUrl) ?? identifier;
  await db
    .insert(linkedinProviderIdentity)
    .values({
      tenantId: ctx.tenantId,
      contactId: contact.id,
      linkedinAccountId: ctx.linkedinAccountId,
      profileUrl: normalizedUrl,
      providerId: parsed.providerId,
      connectionDegree: parsed.degree,
    })
    .onConflictDoUpdate({
      target: [linkedinProviderIdentity.linkedinAccountId, linkedinProviderIdentity.contactId],
      set: { providerId: parsed.providerId, connectionDegree: parsed.degree, profileUrl: normalizedUrl, resolvedAt: new Date() },
    });

  return { providerId: parsed.providerId, degree: parsed.degree };
}

/**
 * A TargetResolver bound to one seat — what the UnipileAdapter / dispatch use.
 * An unresolved contact yields an empty providerId so the adapter refuses it as
 * a client_error (mirrors the no-profile refusal class).
 */
export function makeUnipileTargetResolver(ctx: ResolveCtx): TargetResolver {
  return async (req: LinkedInRequest): Promise<ResolvedTarget> => {
    const resolved = await resolveProviderId(ctx, req.contact);
    return resolved ?? { providerId: "" };
  };
}
