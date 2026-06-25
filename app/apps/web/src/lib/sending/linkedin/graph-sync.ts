/**
 * Spec 36 (T9) — sync a connected seat's 1st-degree relations into (a) the
 * linkedin_relation network snapshot (each relation's member_id pre-populates
 * the send target) and (b) the warm-path graph: for every relation whose
 * profile URL matches a CRM contact, upsert a KNOWS edge (seat owner -> contact)
 * so findWarmPathsToCompanies surfaces "you're already connected to X". Read +
 * idempotent upserts; no LinkedIn write action. Server-only.
 *
 * Match is on linkedinPath(public_profile_url) — the same key contacts dedup on
 * (no identity split). The warm-path value is gated on contacts having a
 * linkedin_url; sourcing (Sales-Nav) is what populates that.
 */

import { db } from "@/db";
import { linkedinRelation, contacts } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { linkedinPath } from "@/db/canonical/identity";
import { readUnipileConfig, listUnipileRelations, type UnipileRelation } from "@/lib/providers/unipile/http";
import { buildKnowsFromLinkedInRelations, type LinkedInRelationMatch } from "@/lib/context/relationship-graph";

export interface SyncSeat {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  unipileAccountId: string;
}

export interface GraphSyncResult {
  relationsFetched: number;
  relationsStored: number;
  contactsWithLinkedin: number;
  matched: number;
  edgesCreated: number;
  edgesUpdated: number;
}

/** Display name from a relation, falling back to the public identifier. */
function relationName(r: UnipileRelation): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.public_identifier || "LinkedIn connection";
}

/**
 * Pull all relations for the seat, store the snapshot, and upsert KNOWS edges
 * for any that match a CRM contact. `maxPages` bounds a single run.
 */
export async function syncLinkedInRelations(seat: SyncSeat, maxPages = 100): Promise<GraphSyncResult> {
  const cfg = readUnipileConfig();
  if (!cfg) throw new Error("Unipile not configured");

  // 1) Paginate + upsert the network snapshot.
  const byPath = new Map<string, { providerId: string; name: string }>();
  let cursor: string | null = null;
  let pages = 0;
  let relationsFetched = 0;
  let relationsStored = 0;

  do {
    const page = await listUnipileRelations(cfg, seat.unipileAccountId, cursor);
    for (const r of page.items) {
      relationsFetched++;
      const path = linkedinPath(r.public_profile_url);
      const providerId = r.member_id?.trim();
      if (!path || !providerId) continue;
      byPath.set(path, { providerId, name: relationName(r) });
      await db
        .insert(linkedinRelation)
        .values({
          tenantId: seat.tenantId,
          linkedinAccountId: seat.id,
          providerId,
          profileUrl: path,
          publicIdentifier: r.public_identifier ?? null,
          displayName: relationName(r),
          headline: r.headline ?? null,
          connectionDegree: "1st",
        })
        .onConflictDoUpdate({
          target: [linkedinRelation.linkedinAccountId, linkedinRelation.providerId],
          set: { profileUrl: path, headline: r.headline ?? null, displayName: relationName(r), lastSyncedAt: new Date() },
        });
      relationsStored++;
    }
    cursor = page.cursor;
    pages++;
  } while (cursor && pages < maxPages);

  // 2) Match against CRM contacts (those with a linkedin_url) and build edges.
  const crm = await db
    .select({ id: contacts.id, linkedinUrl: contacts.linkedinUrl, firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts)
    .where(and(eq(contacts.tenantId, seat.tenantId), isNotNull(contacts.linkedinUrl)));

  const matches: LinkedInRelationMatch[] = [];
  for (const c of crm) {
    const path = linkedinPath(c.linkedinUrl);
    if (!path) continue;
    const rel = byPath.get(path);
    if (!rel) continue;
    matches.push({
      contactId: c.id,
      contactName: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || rel.name,
      profileUrl: path,
    });
  }

  const { edgesCreated, edgesUpdated } =
    matches.length > 0
      ? await buildKnowsFromLinkedInRelations({ tenantId: seat.tenantId, viaUserId: seat.userId, viaUserName: seat.userName, relations: matches })
      : { edgesCreated: 0, edgesUpdated: 0 };

  return {
    relationsFetched,
    relationsStored,
    contactsWithLinkedin: crm.length,
    matched: matches.length,
    edgesCreated,
    edgesUpdated,
  };
}
