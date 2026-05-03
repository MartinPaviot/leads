import { db } from "@/db";
import { contacts, companies, deals, activities, notes } from "@/db/schema";
import { eq, and, desc, isNull, gte, lte, sql } from "drizzle-orm";

export interface CrmDataSet {
  contacts: Array<Record<string, unknown>>;
  accounts: Array<Record<string, unknown>>;
  deals: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
}

interface FetchOptions {
  entities?: Array<"contacts" | "accounts" | "deals" | "activities" | "notes">;
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    stage?: string;
    industry?: string;
  };
  limit?: number;
}

const MAX_RECORDS = 2000;

export async function fetchCrmData(
  tenantId: string,
  options: FetchOptions = {}
): Promise<CrmDataSet> {
  const entities = options.entities ?? ["contacts", "accounts", "deals"];
  const limit = Math.min(options.limit ?? 1000, MAX_RECORDS);
  const result: CrmDataSet = {
    contacts: [],
    accounts: [],
    deals: [],
    activities: [],
    notes: [],
  };

  const dateFrom = options.filters?.dateFrom
    ? new Date(options.filters.dateFrom)
    : undefined;
  const dateTo = options.filters?.dateTo
    ? new Date(options.filters.dateTo)
    : undefined;

  const fetches = entities.map(async (entity) => {
    switch (entity) {
      case "contacts": {
        const conditions = [
          eq(contacts.tenantId, tenantId),
          isNull(contacts.deletedAt),
        ];
        if (dateFrom) conditions.push(gte(contacts.createdAt, dateFrom));
        if (dateTo) conditions.push(lte(contacts.createdAt, dateTo));

        const rows = await db
          .select({
            id: contacts.id,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            email: contacts.email,
            title: contacts.title,
            phone: contacts.phone,
            score: contacts.score,
            companyId: contacts.companyId,
            createdAt: contacts.createdAt,
          })
          .from(contacts)
          .where(and(...conditions))
          .orderBy(desc(contacts.createdAt))
          .limit(limit);

        result.contacts = rows.map((r) => ({
          ...r,
          name: [r.firstName, r.lastName].filter(Boolean).join(" "),
          createdAt: r.createdAt?.toISOString(),
        }));
        break;
      }

      case "accounts": {
        const conditions = [
          eq(companies.tenantId, tenantId),
          isNull(companies.deletedAt),
        ];
        if (dateFrom) conditions.push(gte(companies.createdAt, dateFrom));
        if (dateTo) conditions.push(lte(companies.createdAt, dateTo));
        if (options.filters?.industry) {
          conditions.push(eq(companies.industry, options.filters.industry));
        }

        const rows = await db
          .select({
            id: companies.id,
            name: companies.name,
            domain: companies.domain,
            industry: companies.industry,
            size: companies.size,
            revenue: companies.revenue,
            score: companies.score,
            createdAt: companies.createdAt,
          })
          .from(companies)
          .where(and(...conditions))
          .orderBy(desc(companies.createdAt))
          .limit(limit);

        result.accounts = rows.map((r) => ({
          ...r,
          createdAt: r.createdAt?.toISOString(),
        }));
        break;
      }

      case "deals": {
        const conditions = [
          eq(deals.tenantId, tenantId),
          isNull(deals.deletedAt),
        ];
        if (dateFrom) conditions.push(gte(deals.createdAt, dateFrom));
        if (dateTo) conditions.push(lte(deals.createdAt, dateTo));
        if (options.filters?.stage) {
          conditions.push(eq(deals.stage, options.filters.stage as any));
        }

        const rows = await db
          .select({
            id: deals.id,
            name: deals.name,
            stage: deals.stage,
            value: deals.value,
            currency: deals.currency,
            score: deals.score,
            companyId: deals.companyId,
            contactId: deals.contactId,
            expectedCloseDate: deals.expectedCloseDate,
            createdAt: deals.createdAt,
            updatedAt: deals.updatedAt,
          })
          .from(deals)
          .where(and(...conditions))
          .orderBy(desc(deals.createdAt))
          .limit(limit);

        result.deals = rows.map((r) => ({
          ...r,
          expectedCloseDate: r.expectedCloseDate?.toISOString() ?? null,
          createdAt: r.createdAt?.toISOString(),
          updatedAt: r.updatedAt?.toISOString(),
        }));
        break;
      }

      case "activities": {
        const rows = await db
          .select({
            id: activities.id,
            activityType: activities.activityType,
            channel: activities.channel,
            direction: activities.direction,
            summary: activities.summary,
            entityType: activities.entityType,
            entityId: activities.entityId,
            occurredAt: activities.occurredAt,
          })
          .from(activities)
          .where(eq(activities.tenantId, tenantId))
          .orderBy(desc(activities.occurredAt))
          .limit(Math.min(limit, 500));

        result.activities = rows.map((r) => ({
          ...r,
          occurredAt: r.occurredAt?.toISOString(),
        }));
        break;
      }

      case "notes": {
        const rows = await db
          .select({
            id: notes.id,
            title: notes.title,
            content: notes.content,
            entityType: notes.entityType,
            entityId: notes.entityId,
            createdAt: notes.createdAt,
          })
          .from(notes)
          .where(and(eq(notes.tenantId, tenantId), isNull(notes.deletedAt)))
          .orderBy(desc(notes.createdAt))
          .limit(Math.min(limit, 200));

        result.notes = rows.map((r) => ({
          ...r,
          createdAt: r.createdAt?.toISOString(),
        }));
        break;
      }
    }
  });

  await Promise.all(fetches);
  return result;
}
