/**
 * Postgres IcpVersionStore (spec 11). Reads/writes icp_versions; insert is a new
 * immutable row, supersede flips the prior active one.
 */
import { db } from "@/db";
import { icpVersions } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { IcpCriterionSnapshot, IcpStatus, IcpVersionRecord, IcpVersionStore } from "./version";

function toRec(r: typeof icpVersions.$inferSelect): IcpVersionRecord {
  return { icpId: r.icpId, version: r.version, name: r.name, criteria: (r.criteria as IcpCriterionSnapshot[]) ?? [], status: r.status as IcpStatus };
}

export class DbIcpVersionStore implements IcpVersionStore {
  async latest(tenantId: string, icpId: string): Promise<IcpVersionRecord | null> {
    const [r] = await db.select().from(icpVersions).where(and(eq(icpVersions.tenantId, tenantId), eq(icpVersions.icpId, icpId))).orderBy(desc(icpVersions.version)).limit(1);
    return r ? toRec(r) : null;
  }
  async active(tenantId: string, icpId: string): Promise<IcpVersionRecord | null> {
    const [r] = await db.select().from(icpVersions).where(and(eq(icpVersions.tenantId, tenantId), eq(icpVersions.icpId, icpId), eq(icpVersions.status, "active"))).limit(1);
    return r ? toRec(r) : null;
  }
  async insert(tenantId: string, rec: IcpVersionRecord): Promise<void> {
    await db.insert(icpVersions).values({ tenantId, icpId: rec.icpId, version: rec.version, name: rec.name, criteria: rec.criteria as never, status: rec.status });
  }
  async supersede(tenantId: string, icpId: string, version: number): Promise<void> {
    await db.update(icpVersions).set({ status: "superseded", supersededAt: sql`now()` }).where(and(eq(icpVersions.tenantId, tenantId), eq(icpVersions.icpId, icpId), eq(icpVersions.version, version)));
  }
  async history(tenantId: string, icpId: string): Promise<IcpVersionRecord[]> {
    const rows = await db.select().from(icpVersions).where(and(eq(icpVersions.tenantId, tenantId), eq(icpVersions.icpId, icpId))).orderBy(icpVersions.version);
    return rows.map(toRec);
  }
}

export const dbIcpVersionStore = new DbIcpVersionStore();
