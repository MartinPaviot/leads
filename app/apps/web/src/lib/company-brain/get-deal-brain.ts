/**
 * Phase 4 — Deal Brain.
 *
 * Returns the focal deal's perspective on top of the surrounding
 * Company Brain. The deal brain is a thin lens that :
 *   - resolves the deal (with tenant guard) → companyId + contactId
 *   - fetches the activity slice tied directly to this deal
 *     (entityType="deal" + entityId=dealId)
 *   - calls getCompanyBrain to inherit the wider context
 *   - hydrates `focalDeal` from the company brain's already-derived
 *     deals list so risk/stall/properties stay consistent
 *
 * The primary contact is hydrated from the company brain's contacts
 * array when available, falling back to a minimal stub.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { decisionAwareExcerpt } from "./excerpt";
import { db as defaultDb } from "@/db";
import {
  deals as dealsTable,
  activities as activitiesTable,
} from "@/db/schema";
import {
  getCompanyBrain as defaultGetCompanyBrain,
  type GetCompanyBrainDeps,
} from "./get-brain";
import type {
  CompanyBrainActivity,
  CompanyBrainContact,
  CompanyBrainDeal,
  DealBrain,
  GetDealBrainOpts,
} from "./types";

const DEFAULT_DEAL_ACTIVITY_CAP = 50;

export interface GetDealBrainDeps extends GetCompanyBrainDeps {
  getCompanyBrainFn?: typeof defaultGetCompanyBrain;
}

function maxDate(dates: Array<Date | null | undefined>): Date | null {
  let m: Date | null = null;
  for (const d of dates) {
    if (d && (m === null || d > m)) m = d;
  }
  return m;
}

function makeStubDeal(dealId: string): CompanyBrainDeal {
  return {
    id: dealId,
    name: "(deal not fully hydrated — outside companyBrain cap)",
    stage: "unknown",
    value: null,
    expectedCloseDate: null,
    properties: {},
    riskLevel: null,
    riskReasons: [],
    stallProbability: null,
    stallIndicators: [],
  };
}

export async function getDealBrain(
  dealId: string,
  opts: GetDealBrainOpts,
  deps: GetDealBrainDeps = {},
): Promise<DealBrain | null> {
  if (!opts.tenantId) {
    throw new Error(
      "getDealBrain: opts.tenantId is required (multi-tenant guard)",
    );
  }
  if (!dealId) {
    throw new Error("getDealBrain: dealId is required");
  }

  const startedAt =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  const dbi = deps.db ?? defaultDb;
  const getCompanyBrainFn = deps.getCompanyBrainFn ?? defaultGetCompanyBrain;
  const dealActivityCap = opts.dealActivityCap ?? DEFAULT_DEAL_ACTIVITY_CAP;

  // 1. Resolve focal deal (tenant guard via where clause).
  const [dealRow] = await dbi
    .select({
      id: dealsTable.id,
      tenantId: dealsTable.tenantId,
      companyId: dealsTable.companyId,
      contactId: dealsTable.contactId,
    })
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.id, dealId),
        eq(dealsTable.tenantId, opts.tenantId),
        isNull(dealsTable.deletedAt),
      ),
    )
    .limit(1);

  if (!dealRow) return null;
  if (!dealRow.companyId) {
    // Without a company we can't compose the surrounding brain.
    return null;
  }

  // 2. Surrounding company brain (covers other deals, contacts,
  //    activities, knowledge, edges, memories).
  const companyBrain = await getCompanyBrainFn(
    dealRow.companyId,
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

  // 3. Deal-specific activity slice.
  const dealActivityRows = await dbi
    .select({
      id: activitiesTable.id,
      type: activitiesTable.activityType,
      direction: activitiesTable.direction,
      occurredAt: activitiesTable.occurredAt,
      summary: activitiesTable.summary,
      entityType: activitiesTable.entityType,
      entityId: activitiesTable.entityId,
      excerptRaw: sql<string | null>`left(${activitiesTable.rawContent}, 2000)`,
    })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.tenantId, opts.tenantId),
        eq(activitiesTable.entityType, "deal"),
        eq(activitiesTable.entityId, dealId),
        isNull(activitiesTable.deletedAt),
      ),
    )
    .orderBy(desc(activitiesTable.occurredAt))
    .limit(dealActivityCap + 1);

  const dealActivities: CompanyBrainActivity[] = dealActivityRows
    .slice(0, dealActivityCap)
    .map((r) => ({
      id: r.id,
      type: String(r.type),
      direction: r.direction,
      occurredAt: r.occurredAt ?? new Date(0),
      summary: r.summary,
      entityType: r.entityType,
      entityId: r.entityId,
      excerpt: decisionAwareExcerpt(r.excerptRaw),
    }));
  const dealActivitiesTruncated =
    dealActivityRows.length > dealActivityCap;

  // 4. Hydrate focal deal from the company brain's deals list (so we
  //    inherit risk + stall + citation properties). Fall back to a
  //    stub when the deal is somehow not in that list — this can
  //    happen if the company has more open deals than our cap, but
  //    in practice that cap defaults to "all open deals".
  const focalDeal: CompanyBrainDeal =
    companyBrain.deals.find((d) => d.id === dealId) ?? makeStubDeal(dealId);

  // 5. Primary contact (deal.contact_id may be null).
  let primaryContact: CompanyBrainContact | null = null;
  if (dealRow.contactId) {
    primaryContact =
      companyBrain.contacts.find((c) => c.id === dealRow.contactId) ?? null;
  }

  const result = {
    focalDeal,
    primaryContact,
    dealActivities,
    companyBrain,
    freshness: {
      focalDeal: focalDeal.expectedCloseDate ?? null,
      dealActivities: maxDate(dealActivities.map((a) => a.occurredAt)),
    },
    truncated: { dealActivities: dealActivitiesTruncated },
  };

  const durationMs = Math.round(
    (typeof performance !== "undefined" &&
    typeof performance.now === "function"
      ? performance.now()
      : Date.now()) - startedAt,
  );
  console.log(
    JSON.stringify({
      _brain: "deal",
      dealId,
      tenantId: opts.tenantId,
      durationMs,
      dealActivities: dealActivities.length,
      hasPrimaryContact: primaryContact !== null,
      truncated: result.truncated,
    }),
  );

  return result;
}
