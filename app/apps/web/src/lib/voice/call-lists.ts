/**
 * Call lists repository — sector segments selectable in "To call now"
 * (model A2a, _specs/call-lists). Thin, tenant-scoped DB access mirroring the
 * sibling campaign helpers (lib/voice/campaign.ts): EVERY query filters by
 * tenantId, the app-layer isolation the rest of the module relies on
 * (RLS is a dormant fallback-allow safety net, not the primary boundary).
 *
 * A list is a named SprintAudience (the per-list segment) + one sort key.
 * System "by-day" lists (Today / Callbacks due / New) are DERIVED from target
 * state elsewhere (T4) and never stored here.
 */

import { db } from "@/db";
import { callLists } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { SprintAudience } from "./sprint-audience";

/** The R5 sort keys a list may carry (drive lib/voice/queue ordering, T6). */
export type CallListSort =
  | "fit"
  | "intent"
  | "accessibility"
  | "deal_value"
  | "oldest_callback"
  | "fewest_attempts"
  | "local_time";

export const CALL_LIST_SORTS: readonly CallListSort[] = [
  "fit",
  "intent",
  "accessibility",
  "deal_value",
  "oldest_callback",
  "fewest_attempts",
  "local_time",
];

/** A sort value coerced to a known key (defaults to fit for legacy/garbage). */
export function coerceSort(v: unknown): CallListSort {
  return typeof v === "string" && (CALL_LIST_SORTS as readonly string[]).includes(v)
    ? (v as CallListSort)
    : "fit";
}

export interface CallListRow {
  id: string;
  campaignId: string;
  ownerId: string | null;
  name: string;
  kind: string;
  segment: SprintAudience;
  sort: CallListSort;
  createdAt: string | null;
  updatedAt: string | null;
}

function mapRow(r: typeof callLists.$inferSelect): CallListRow {
  return {
    id: r.id,
    campaignId: r.campaignId,
    ownerId: r.ownerId ?? null,
    name: r.name,
    kind: r.kind,
    // Stored as a SprintAudience-shaped object; callers re-validate labels
    // through validateSprintLabels before they ever drive SQL.
    segment: (r.segment ?? {}) as SprintAudience,
    sort: coerceSort(r.sort),
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
  };
}

/** All sector lists for a campaign, newest first. Tenant-scoped. */
export async function listCallLists(tenantId: string, campaignId: string): Promise<CallListRow[]> {
  const rows = await db
    .select()
    .from(callLists)
    .where(and(eq(callLists.tenantId, tenantId), eq(callLists.campaignId, campaignId)))
    .orderBy(desc(callLists.createdAt));
  return rows.map(mapRow);
}

/** One list by id, tenant-scoped (null when absent or owned by another tenant). */
export async function getCallList(tenantId: string, id: string): Promise<CallListRow | null> {
  const [row] = await db
    .select()
    .from(callLists)
    .where(and(eq(callLists.tenantId, tenantId), eq(callLists.id, id)))
    .limit(1);
  return row ? mapRow(row) : null;
}

export interface CreateCallListArgs {
  tenantId: string;
  campaignId: string;
  ownerId?: string | null;
  name: string;
  segment: SprintAudience;
  sort?: CallListSort;
}

export async function createCallList(args: CreateCallListArgs): Promise<CallListRow> {
  const [row] = await db
    .insert(callLists)
    .values({
      tenantId: args.tenantId,
      campaignId: args.campaignId,
      ownerId: args.ownerId ?? null,
      name: args.name.trim() || "Liste",
      kind: "sector",
      segment: args.segment,
      sort: args.sort ?? "fit",
    })
    .returning();
  return mapRow(row);
}

export interface UpdateCallListArgs {
  tenantId: string;
  id: string;
  name?: string;
  segment?: SprintAudience;
  sort?: CallListSort;
}

/** Patch a list in place (tenant-scoped). Null when no such list for the tenant. */
export async function updateCallList(args: UpdateCallListArgs): Promise<CallListRow | null> {
  const patch: Partial<typeof callLists.$inferInsert> = { updatedAt: new Date() };
  if (typeof args.name === "string" && args.name.trim()) patch.name = args.name.trim();
  if (args.segment) patch.segment = args.segment;
  if (args.sort) patch.sort = args.sort;
  const [row] = await db
    .update(callLists)
    .set(patch)
    .where(and(eq(callLists.tenantId, args.tenantId), eq(callLists.id, args.id)))
    .returning();
  return row ? mapRow(row) : null;
}

/** Delete a list (tenant-scoped). Returns true when a row was removed. */
export async function deleteCallList(tenantId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(callLists)
    .where(and(eq(callLists.tenantId, tenantId), eq(callLists.id, id)))
    .returning({ id: callLists.id });
  return rows.length > 0;
}
