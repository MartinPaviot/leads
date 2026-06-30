/**
 * Tenant-scoped DB helpers for search monitors (saved recurring LinkedIn ICP
 * queries). Used by the chat tools (CRUD) and the daily cron (run + record).
 */
import { db } from "@/db";
import { searchMonitors } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { SourcingInput } from "./source-runner";

export interface SearchMonitorRow {
  id: string;
  label: string;
  category: string;
  criteria: SourcingInput;
  status: string;
  maxPerRun: number;
  lastRunAt: Date | null;
  lastRunSummary: unknown;
}

const COLS = {
  id: searchMonitors.id,
  label: searchMonitors.label,
  category: searchMonitors.category,
  criteria: searchMonitors.criteria,
  status: searchMonitors.status,
  maxPerRun: searchMonitors.maxPerRun,
  lastRunAt: searchMonitors.lastRunAt,
  lastRunSummary: searchMonitors.lastRunSummary,
};

/** Create or replace (by label) a monitor. Returns the row. */
export async function upsertMonitor(
  tenantId: string,
  createdBy: string | null,
  input: { label: string; category: string; criteria: SourcingInput; maxPerRun?: number },
): Promise<SearchMonitorRow> {
  const maxPerRun = Math.min(500, Math.max(1, Math.floor(input.maxPerRun ?? 100)));
  const [row] = await db
    .insert(searchMonitors)
    .values({ tenantId, createdBy: createdBy ?? undefined, label: input.label, category: input.category, criteria: input.criteria as unknown as object, maxPerRun, status: "active" })
    .onConflictDoUpdate({
      target: [searchMonitors.tenantId, searchMonitors.label],
      set: { category: input.category, criteria: input.criteria as unknown as object, maxPerRun, status: "active", updatedAt: sql`now()` },
    })
    .returning(COLS);
  return row as SearchMonitorRow;
}

export async function listMonitors(tenantId: string): Promise<SearchMonitorRow[]> {
  return (await db.select(COLS).from(searchMonitors).where(eq(searchMonitors.tenantId, tenantId)).orderBy(searchMonitors.label)) as SearchMonitorRow[];
}

/** Resolve a monitor by id or (case-insensitive) label within the tenant. */
export async function resolveMonitorRef(tenantId: string, ref: { id?: string; label?: string }): Promise<SearchMonitorRow | null> {
  if (ref.id) {
    const [m] = await db.select(COLS).from(searchMonitors).where(and(eq(searchMonitors.tenantId, tenantId), eq(searchMonitors.id, ref.id))).limit(1);
    return (m as SearchMonitorRow) ?? null;
  }
  const label = ref.label?.trim();
  if (!label) return null;
  const [m] = await db
    .select(COLS)
    .from(searchMonitors)
    .where(and(eq(searchMonitors.tenantId, tenantId), sql`lower(${searchMonitors.label}) = lower(${label})`))
    .limit(1);
  return (m as SearchMonitorRow) ?? null;
}

export async function setMonitorStatus(tenantId: string, id: string, status: "active" | "paused"): Promise<void> {
  await db.update(searchMonitors).set({ status, updatedAt: sql`now()` }).where(and(eq(searchMonitors.tenantId, tenantId), eq(searchMonitors.id, id)));
}

export async function deleteMonitor(tenantId: string, id: string): Promise<void> {
  await db.delete(searchMonitors).where(and(eq(searchMonitors.tenantId, tenantId), eq(searchMonitors.id, id)));
}

/** Record a run's outcome on the monitor (the cron's write). */
export async function recordMonitorRun(id: string, summary: Record<string, unknown>): Promise<void> {
  await db.update(searchMonitors).set({ lastRunAt: sql`now()`, lastRunSummary: summary as object, updatedAt: sql`now()` }).where(eq(searchMonitors.id, id));
}

/** All ACTIVE monitors across all tenants (for the cron), tenant-grouped. */
export async function activeMonitorsByTenant(): Promise<Map<string, SearchMonitorRow[]>> {
  const rows = await db
    .select({ ...COLS, tenantId: searchMonitors.tenantId })
    .from(searchMonitors)
    .where(eq(searchMonitors.status, "active"));
  const byTenant = new Map<string, SearchMonitorRow[]>();
  for (const r of rows) {
    const list = byTenant.get(r.tenantId) ?? [];
    list.push(r as SearchMonitorRow);
    byTenant.set(r.tenantId, list);
  }
  return byTenant;
}
