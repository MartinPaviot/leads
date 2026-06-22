/**
 * Versioned ICP store (spec 11, AC1). Editing an ICP creates a NEW immutable
 * version and supersedes the prior active one; prior versions are retained. Pure
 * version logic + an injected store (InMemory for tests, Postgres for prod).
 */

export interface IcpCriterionSnapshot {
  fieldKey: string;
  operator: string;
  value: unknown;
  weight: number;
  isRequired?: boolean;
  /** Negative-ICP exclusion criterion (hard filter, AC4). */
  isExclusion?: boolean;
  /** Whether a provider can evaluate this field (AC3). */
  operable?: boolean;
}

export type IcpStatus = "draft" | "active" | "superseded";

export interface IcpVersionRecord {
  icpId: string;
  version: number;
  name: string;
  criteria: IcpCriterionSnapshot[];
  status: IcpStatus;
}

export interface IcpVersionStore {
  latest(tenantId: string, icpId: string): Promise<IcpVersionRecord | null>;
  active(tenantId: string, icpId: string): Promise<IcpVersionRecord | null>;
  insert(tenantId: string, rec: IcpVersionRecord): Promise<void>;
  supersede(tenantId: string, icpId: string, version: number): Promise<void>;
  /** All versions for an ICP (history, ascending). */
  history(tenantId: string, icpId: string): Promise<IcpVersionRecord[]>;
}

export function nextVersionNumber(prior: IcpVersionRecord | null): number {
  return (prior?.version ?? 0) + 1;
}

/** Save a new immutable version; on makeActive, supersede the prior active one. */
export async function saveIcpVersion(
  tenantId: string,
  icpId: string,
  name: string,
  criteria: IcpCriterionSnapshot[],
  store: IcpVersionStore,
  opts: { makeActive?: boolean } = {},
): Promise<IcpVersionRecord> {
  const makeActive = opts.makeActive ?? true;
  const prior = await store.latest(tenantId, icpId);
  const version = nextVersionNumber(prior);
  if (makeActive) {
    const active = await store.active(tenantId, icpId);
    if (active) await store.supersede(tenantId, icpId, active.version);
  }
  const rec: IcpVersionRecord = { icpId, version, name, criteria, status: makeActive ? "active" : "draft" };
  await store.insert(tenantId, rec);
  return rec;
}

export function getActiveIcp(tenantId: string, icpId: string, store: IcpVersionStore): Promise<IcpVersionRecord | null> {
  return store.active(tenantId, icpId);
}

// ─── In-memory store (tests) ─────────────────────────────────────
export class InMemoryIcpVersionStore implements IcpVersionStore {
  private rows: Array<{ tenantId: string } & IcpVersionRecord> = [];
  async latest(tenantId: string, icpId: string) {
    const vs = this.rows.filter((r) => r.tenantId === tenantId && r.icpId === icpId);
    return vs.length ? vs.reduce((a, b) => (b.version > a.version ? b : a)) : null;
  }
  async active(tenantId: string, icpId: string) {
    return this.rows.find((r) => r.tenantId === tenantId && r.icpId === icpId && r.status === "active") ?? null;
  }
  async insert(tenantId: string, rec: IcpVersionRecord) {
    this.rows.push({ tenantId, ...rec });
  }
  async supersede(tenantId: string, icpId: string, version: number) {
    const r = this.rows.find((x) => x.tenantId === tenantId && x.icpId === icpId && x.version === version);
    if (r) r.status = "superseded";
  }
  async history(tenantId: string, icpId: string) {
    return this.rows.filter((r) => r.tenantId === tenantId && r.icpId === icpId).sort((a, b) => a.version - b.version);
  }
}
