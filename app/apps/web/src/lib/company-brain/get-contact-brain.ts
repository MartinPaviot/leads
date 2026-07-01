/**
 * Phase 4 — Contact Brain.
 *
 * Returns the focal contact's perspective on top of the surrounding
 * Company Brain. The contact brain is intentionally a thin lens :
 *   - resolve the contact (with tenant guard)
 *   - fetch the activity slice tied directly to this contact
 *     (entityType="contact" + entityId=contactId)
 *   - fetch the deals where this contact is the primary contact
 *   - call getCompanyBrain to inherit the wider context
 *   - hydrate `focalContact` and `ownedDeals` from the company
 *     brain's already-derived rows so champion + intent + risk +
 *     stall fields stay consistent across both lenses.
 *
 * Design note : we don't re-derive intent or champion flags here.
 * They flow from the company brain pipeline, which is the single
 * source of truth for contact/deal scoring. Reusing those rows
 * also means a contact brain doesn't trigger extra
 * `scoreBuyerIntent` / `predictStalls` calls.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { decisionAwareExcerpt } from "./excerpt";
import { db as defaultDb } from "@/db";
import {
  contacts as contactsTable,
  activities as activitiesTable,
  deals as dealsTable,
  users as usersTable,
} from "@/db/schema";
import { resolveActorName } from "@/lib/collision/actor-name";
import {
  getCompanyBrain as defaultGetCompanyBrain,
  type GetCompanyBrainDeps,
} from "./get-brain";
import type {
  ContactBrain,
  CompanyBrainActivity,
  CompanyBrainContact,
  CompanyBrainDeal,
  GetContactBrainOpts,
} from "./types";

const DEFAULT_DIRECT_ACTIVITY_CAP = 50;

export interface GetContactBrainDeps extends GetCompanyBrainDeps {
  getCompanyBrainFn?: typeof defaultGetCompanyBrain;
}

function maxDate(dates: Array<Date | null | undefined>): Date | null {
  let m: Date | null = null;
  for (const d of dates) {
    if (d && (m === null || d > m)) m = d;
  }
  return m;
}

export async function getContactBrain(
  contactId: string,
  opts: GetContactBrainOpts,
  deps: GetContactBrainDeps = {},
): Promise<ContactBrain | null> {
  if (!opts.tenantId) {
    throw new Error(
      "getContactBrain: opts.tenantId is required (multi-tenant guard)",
    );
  }
  if (!contactId) {
    throw new Error("getContactBrain: contactId is required");
  }

  const startedAt =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  const dbi = deps.db ?? defaultDb;
  const getCompanyBrainFn = deps.getCompanyBrainFn ?? defaultGetCompanyBrain;
  const directActivityCap =
    opts.directActivityCap ?? DEFAULT_DIRECT_ACTIVITY_CAP;

  // 1. Resolve focal contact (tenant guard via the where clause).
  const [contactRow] = await dbi
    .select({
      id: contactsTable.id,
      tenantId: contactsTable.tenantId,
      companyId: contactsTable.companyId,
    })
    .from(contactsTable)
    .where(
      and(
        eq(contactsTable.id, contactId),
        eq(contactsTable.tenantId, opts.tenantId),
        isNull(contactsTable.deletedAt),
      ),
    )
    .limit(1);

  if (!contactRow) return null;

  // 2. Without a companyId we can't compose the surrounding brain.
  //    This is rare (orphan contact) — return a degraded brain.
  if (!contactRow.companyId) {
    return null;
  }

  // 3. Surrounding company brain (this also pulls the focal contact
  //    inside `companyBrain.contacts` with intent + champion fields
  //    already derived).
  const companyBrain = await getCompanyBrainFn(
    contactRow.companyId,
    {
      tenantId: opts.tenantId,
      recentActivityCap: opts.recentActivityCap,
      contactCap: opts.contactCap,
      memoryCap: opts.memoryCap,
      includeDossier: opts.includeDossier,
    },
    deps,
  );
  if (!companyBrain) return null;

  // 4. Direct activities (cap+1 for truncation flag).
  const directActivityRows = await dbi
    .select({
      id: activitiesTable.id,
      type: activitiesTable.activityType,
      direction: activitiesTable.direction,
      occurredAt: activitiesTable.occurredAt,
      summary: activitiesTable.summary,
      entityType: activitiesTable.entityType,
      entityId: activitiesTable.entityId,
      excerptRaw: sql<string | null>`left(${activitiesTable.rawContent}, 2000)`,
      actorType: activitiesTable.actorType,
      actorId: activitiesTable.actorId,
    })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.tenantId, opts.tenantId),
        eq(activitiesTable.entityType, "contact"),
        eq(activitiesTable.entityId, contactId),
        isNull(activitiesTable.deletedAt),
      ),
    )
    .orderBy(desc(activitiesTable.occurredAt))
    .limit(directActivityCap + 1);

  // Member display names for nominative history ("Marie · call · 2d ago").
  // Fail-safe: names are a nice-to-have, never fail the brain (which feeds the
  // Call Mode brief) over them — on any error actorName is simply null.
  let memberNames = new Map<string, string>();
  try {
    const memberRows = await dbi
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(usersTable)
      .where(eq(usersTable.tenantId, opts.tenantId));
    memberNames = new Map(
      memberRows.map((m) => [
        m.id,
        [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || "",
      ]),
    );
  } catch {
    // names stay empty → actorName null everywhere (anonymous line)
  }

  const directActivities: CompanyBrainActivity[] = directActivityRows
    .slice(0, directActivityCap)
    .map((r) => ({
      id: r.id,
      type: String(r.type),
      direction: r.direction,
      occurredAt: r.occurredAt ?? new Date(0),
      summary: r.summary,
      entityType: r.entityType,
      entityId: r.entityId,
      excerpt: decisionAwareExcerpt(r.excerptRaw),
      actorName: resolveActorName(r.actorType, r.actorId, memberNames),
    }));

  const directActivitiesTruncated =
    directActivityRows.length > directActivityCap;

  // 5. Owned deals : where this contact is the primary contact_id.
  const ownedDealRows = await dbi
    .select({ id: dealsTable.id })
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.tenantId, opts.tenantId),
        eq(dealsTable.contactId, contactId),
        isNull(dealsTable.deletedAt),
      ),
    );
  const ownedDealIds = new Set(ownedDealRows.map((r) => r.id));
  const ownedDeals: CompanyBrainDeal[] = companyBrain.deals.filter((d) =>
    ownedDealIds.has(d.id),
  );

  // 6. Hydrate focal contact from the company brain's already-derived
  //    contact rows, falling back to a minimal stub when the contact
  //    isn't in the cap-limited set.
  const focalContact: CompanyBrainContact = companyBrain.contacts.find(
    (c) => c.id === contactId,
  ) ?? {
    id: contactId,
    firstName: null,
    lastName: null,
    email: null,
    title: null,
    isChampion: false,
    intentScore: null,
    intentTrend: null,
    lastTouchAt: null,
  };

  const result = {
    focalContact,
    directActivities,
    ownedDeals,
    companyBrain,
    freshness: {
      focalContact: focalContact.lastTouchAt,
      directActivities: maxDate(directActivities.map((a) => a.occurredAt)),
      ownedDeals: maxDate(
        ownedDeals.map((d) => d.expectedCloseDate ?? null),
      ),
    },
    truncated: { directActivities: directActivitiesTruncated },
  };

  const durationMs = Math.round(
    (typeof performance !== "undefined" &&
    typeof performance.now === "function"
      ? performance.now()
      : Date.now()) - startedAt,
  );
  console.log(
    JSON.stringify({
      _brain: "contact",
      contactId,
      tenantId: opts.tenantId,
      durationMs,
      directActivities: directActivities.length,
      ownedDeals: ownedDeals.length,
      truncated: result.truncated,
    }),
  );

  return result;
}
