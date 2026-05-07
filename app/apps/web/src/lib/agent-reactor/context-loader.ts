import { db } from "@/db";
import {
  companies,
  contacts,
  deals,
  activities,
  sequenceEnrollments,
  sequences,
  agentActions,
  agentWorkItems,
} from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import type { ReactorContext } from "./types";

export async function loadReactorContext(
  tenantId: string,
  entityType: string,
  entityId: string,
  triggerMetadata: Record<string, unknown>,
): Promise<ReactorContext> {
  const [entity, recentActs, seqEnrollments, pastActs, workItem, settings] =
    await Promise.all([
      loadEntity(tenantId, entityType, entityId),
      loadRecentActivities(tenantId, entityType, entityId),
      loadActiveSequences(tenantId, entityType, entityId),
      loadPastActions(tenantId, entityType, entityId),
      loadWorkItem(tenantId, entityType, entityId),
      getTenantSettings(tenantId),
    ]);

  return {
    entity,
    recentActivities: recentActs,
    activeSequences: seqEnrollments,
    signals: (entity.data as Record<string, unknown>)?.signals
      ? Object.entries((entity.data as Record<string, unknown>).signals as Record<string, unknown>).map(
          ([type, value]) => ({ type, value }),
        )
      : [],
    pastActions: pastActs,
    workItem,
    icp: {
      industries: settings?.targetIndustries ?? [],
      sizes: settings?.targetCompanySizes ?? [],
      roles: settings?.targetRoles ? [settings.targetRoles] : [],
      geographies: settings?.targetGeographies ?? [],
    },
    triggerMetadata,
  };
}

async function loadEntity(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<ReactorContext["entity"]> {
  if (entityType === "company") {
    const [row] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.id, entityId), eq(companies.tenantId, tenantId)))
      .limit(1);
    if (!row) return { type: entityType, id: entityId, label: "Unknown company", data: {} };
    return {
      type: entityType,
      id: entityId,
      label: row.name ?? row.domain ?? "Unknown company",
      data: {
        name: row.name,
        domain: row.domain,
        industry: row.industry,
        size: row.size,
        score: row.score,
        properties: row.properties,
      },
    };
  }

  if (entityType === "contact") {
    const [row] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, entityId), eq(contacts.tenantId, tenantId)))
      .limit(1);
    if (!row) return { type: entityType, id: entityId, label: "Unknown contact", data: {} };
    return {
      type: entityType,
      id: entityId,
      label: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || "Unknown contact",
      data: {
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        title: row.title,
        score: row.score,
        companyId: row.companyId,
      },
    };
  }

  if (entityType === "deal") {
    const [row] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, entityId), eq(deals.tenantId, tenantId)))
      .limit(1);
    if (!row) return { type: entityType, id: entityId, label: "Unknown deal", data: {} };
    return {
      type: entityType,
      id: entityId,
      label: row.name ?? "Untitled deal",
      data: {
        name: row.name,
        stage: row.stage,
        value: row.value,
        companyId: row.companyId,
        contactId: row.contactId,
        createdAt: row.createdAt?.toISOString(),
      },
    };
  }

  return { type: entityType, id: entityId, label: "Unknown entity", data: {} };
}

async function loadRecentActivities(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<ReactorContext["recentActivities"]> {
  const rows = await db
    .select({
      activityType: activities.activityType,
      summary: activities.summary,
      occurredAt: activities.occurredAt,
      direction: activities.direction,
      sentiment: activities.sentiment,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, entityType),
        eq(activities.entityId, entityId),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(10);

  return rows.map((r) => ({
    type: r.activityType,
    summary: r.summary ?? "",
    occurredAt: r.occurredAt?.toISOString() ?? "",
    direction: r.direction ?? undefined,
    sentiment: r.sentiment ?? undefined,
  }));
}

async function loadActiveSequences(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<ReactorContext["activeSequences"]> {
  if (entityType !== "contact") return [];

  const rows = await db
    .select({
      sequenceName: sequences.name,
      currentStep: sequenceEnrollments.currentStep,
      status: sequenceEnrollments.status,
    })
    .from(sequenceEnrollments)
    .innerJoin(sequences, eq(sequences.id, sequenceEnrollments.sequenceId))
    .where(
      and(
        eq(sequenceEnrollments.contactId, entityId),
        eq(sequences.tenantId, tenantId),
      ),
    )
    .limit(5);

  return rows.map((r) => ({
    sequenceName: r.sequenceName ?? "Unnamed",
    currentStep: r.currentStep ?? 0,
    totalSteps: 0,
    status: r.status ?? "unknown",
  }));
}

async function loadPastActions(
  tenantId: string,
  _entityType: string,
  entityId: string,
): Promise<ReactorContext["pastActions"]> {
  const rows = await db
    .select({
      actionType: agentActions.actionType,
      payload: agentActions.payload,
      createdAt: agentActions.createdAt,
      status: agentActions.status,
    })
    .from(agentActions)
    .where(eq(agentActions.tenantId, tenantId))
    .orderBy(desc(agentActions.createdAt))
    .limit(5);

  return rows.map((r) => ({
    actionType: r.actionType,
    reasoning: ((r.payload as Record<string, unknown>)?.reasoning as string) ?? "",
    createdAt: r.createdAt.toISOString(),
    status: r.status,
  }));
}

async function loadWorkItem(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<ReactorContext["workItem"]> {
  const [row] = await db
    .select({
      strategy: agentWorkItems.strategy,
      nextAction: agentWorkItems.nextAction,
      priority: agentWorkItems.priority,
    })
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.tenantId, tenantId),
        eq(agentWorkItems.entityType, entityType),
        eq(agentWorkItems.entityId, entityId),
        eq(agentWorkItems.status, "active"),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    strategy: row.strategy,
    nextAction: row.nextAction,
    priority: row.priority,
  };
}
