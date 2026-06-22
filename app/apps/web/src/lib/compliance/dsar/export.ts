/**
 * Spec 34 (AC1) — DSAR access export. Compiles everything held for a person —
 * canonical record, field-source provenance, activity, and CRM-synced data —
 * into one export. Deterministic over injected store readers. Blast radius:
 * compliance/dsar/* only.
 */

export interface DsarStores {
  readCanonical: (personId: string) => Promise<Record<string, unknown> | null>;
  readProvenance: (personId: string) => Promise<unknown[]>;
  readActivity: (personId: string) => Promise<unknown[]>;
  readCrm: (personId: string) => Promise<Record<string, unknown> | null>;
}

export interface SubjectExport {
  personId: string;
  canonical: Record<string, unknown> | null;
  provenance: unknown[];
  activity: unknown[];
  crm: Record<string, unknown> | null;
  compiledAt: number;
  /** True when no data was found in any managed store. */
  empty: boolean;
}

export interface ExportDeps {
  stores: DsarStores;
  now?: () => number;
}

/** AC1 — compile the full subject export from all managed stores. */
export async function exportSubject(personId: string, deps: ExportDeps): Promise<SubjectExport> {
  const now = deps.now ?? (() => Date.now());
  const [canonical, provenance, activity, crm] = await Promise.all([
    deps.stores.readCanonical(personId),
    deps.stores.readProvenance(personId),
    deps.stores.readActivity(personId),
    deps.stores.readCrm(personId),
  ]);
  const empty = !canonical && provenance.length === 0 && activity.length === 0 && !crm;
  return { personId, canonical, provenance, activity, crm, compiledAt: now(), empty };
}
