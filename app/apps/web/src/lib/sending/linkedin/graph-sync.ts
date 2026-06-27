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
import { linkedinRelation, linkedinAccount, contacts } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { linkedinPath } from "@/db/canonical/identity";
import { readUnipileConfig, listUnipileRelations, type UnipileRelation } from "@/lib/providers/unipile/http";
import { buildKnowsFromLinkedInRelations, type LinkedInRelationMatch } from "@/lib/context/relationship-graph";
import { recordCompanySignal } from "@/lib/signals/record-signal";

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
  warmSignalsEmitted: number;
}

/** Display name from a relation, falling back to the public identifier. */
function relationName(r: UnipileRelation): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.public_identifier || "LinkedIn connection";
}

type CrmContactRow = { id: string; linkedinUrl: string | null; firstName: string | null; lastName: string | null };

/**
 * Match CRM contacts (those carrying a linkedin_url) to a seat's relations by
 * the shared linkedinPath key — the same key contacts dedup on, so there is no
 * identity split. Pure; shared by the live sync and the snapshot rematch.
 */
function matchContacts(crm: CrmContactRow[], byPath: Map<string, { name: string }>): LinkedInRelationMatch[] {
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
  return matches;
}

/**
 * Emit a FREE pre-outreach buying signal — `warm_connection` — on the COMPANY
 * of every matched contact (a CRM contact who is a 1st-degree relation of the
 * seat). This is the cold-TAM differentiator: an account where the founder is
 * already connected ranks above the silent mass. Structural (never-stale TTL);
 * re-emitted each sync so it stays current. `companyByContact` is built from the
 * already-loaded CRM rows (no extra query). Returns the distinct company count.
 */
export async function emitWarmConnectionSignals(
  tenantId: string,
  matchedContactIds: string[],
  companyByContact: Map<string, string | null>,
): Promise<number> {
  // First matched contact per company = the warm connection to write TO
  // (Monaco signal→person: the relationship names the right recipient).
  const contactByCompany = new Map<string, string>();
  for (const contactId of matchedContactIds) {
    const cid = companyByContact.get(contactId);
    if (cid && !contactByCompany.has(cid)) contactByCompany.set(cid, contactId);
  }
  const detectedAt = new Date().toISOString();
  for (const [companyId, contactId] of contactByCompany) {
    await recordCompanySignal(tenantId, companyId, {
      type: "warm_connection",
      detectedAt,
      strength: "high",
      source: "linkedin_graph",
      person: { contactId },
    });
  }
  return contactByCompany.size;
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
    .select({ id: contacts.id, companyId: contacts.companyId, linkedinUrl: contacts.linkedinUrl, firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts)
    .where(and(eq(contacts.tenantId, seat.tenantId), isNotNull(contacts.linkedinUrl)));

  const matches = matchContacts(crm, byPath);
  const companyByContact = new Map<string, string | null>(crm.map((c) => [c.id, c.companyId]));

  const { edgesCreated, edgesUpdated } =
    matches.length > 0
      ? await buildKnowsFromLinkedInRelations({ tenantId: seat.tenantId, viaUserId: seat.userId, viaUserName: seat.userName, relations: matches })
      : { edgesCreated: 0, edgesUpdated: 0 };

  const warmSignalsEmitted = await emitWarmConnectionSignals(seat.tenantId, matches.map((m) => m.contactId), companyByContact);

  return {
    relationsFetched,
    relationsStored,
    contactsWithLinkedin: crm.length,
    matched: matches.length,
    edgesCreated,
    edgesUpdated,
    warmSignalsEmitted,
  };
}

export interface RematchResult {
  seats: number;
  matched: number;
  edgesCreated: number;
  edgesUpdated: number;
  warmSignalsEmitted: number;
}

/**
 * Snapshot-based rematch — NO Unipile calls. For every connected seat in the
 * tenant, match its ALREADY-STORED relation snapshot (linkedin_relation) against
 * the current CRM contacts and (re)build KNOWS edges. Cheap to run right after a
 * sourcing run so freshly-sourced contacts immediately light up warm paths,
 * without re-pulling the network (the full pull happens on connect). Idempotent.
 */
export async function rematchStoredRelations(tenantId: string): Promise<RematchResult> {
  const seats = await db
    .select({ id: linkedinAccount.id, userId: linkedinAccount.userId, displayName: linkedinAccount.displayName })
    .from(linkedinAccount)
    .where(and(eq(linkedinAccount.tenantId, tenantId), eq(linkedinAccount.status, "connected")));
  if (seats.length === 0) return { seats: 0, matched: 0, edgesCreated: 0, edgesUpdated: 0, warmSignalsEmitted: 0 };

  const crm = await db
    .select({ id: contacts.id, companyId: contacts.companyId, linkedinUrl: contacts.linkedinUrl, firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), isNotNull(contacts.linkedinUrl)));
  if (crm.length === 0) return { seats: seats.length, matched: 0, edgesCreated: 0, edgesUpdated: 0, warmSignalsEmitted: 0 };
  const companyByContact = new Map<string, string | null>(crm.map((c) => [c.id, c.companyId]));

  let matched = 0;
  let edgesCreated = 0;
  let edgesUpdated = 0;
  const matchedContactIds = new Set<string>();
  for (const seat of seats) {
    const rels = await db
      .select({ profileUrl: linkedinRelation.profileUrl, displayName: linkedinRelation.displayName })
      .from(linkedinRelation)
      .where(eq(linkedinRelation.linkedinAccountId, seat.id));
    if (rels.length === 0) continue;
    const byPath = new Map<string, { name: string }>();
    for (const r of rels) byPath.set(r.profileUrl, { name: r.displayName ?? "LinkedIn connection" });
    const matches = matchContacts(crm, byPath);
    if (matches.length === 0) continue;
    matched += matches.length;
    for (const m of matches) matchedContactIds.add(m.contactId);
    const res = await buildKnowsFromLinkedInRelations({
      tenantId,
      viaUserId: seat.userId,
      viaUserName: seat.displayName ?? "LinkedIn seat owner",
      relations: matches,
    });
    edgesCreated += res.edgesCreated;
    edgesUpdated += res.edgesUpdated;
  }
  const warmSignalsEmitted = await emitWarmConnectionSignals(tenantId, [...matchedContactIds], companyByContact);
  return { seats: seats.length, matched, edgesCreated, edgesUpdated, warmSignalsEmitted };
}
