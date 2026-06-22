/**
 * Spec 28 — CRM sync orchestration. Idempotent upsert (by external id / identity,
 * no duplicates), bounded rate-limit retries, metering, and a result the caller
 * logs. Deterministic except the external write. Blast radius: crm/* only.
 */

import { HubSpotAdapter, CrmRateLimitError, type CrmEntity, type CrmFieldMapping, type HubSpotClient } from "@/lib/providers/hubspot/adapter";

export interface MeterOp {
  workspace: string;
  kind: string;
  provider: string;
  amount: number;
  ref: string;
}

export interface SyncDeps {
  client: HubSpotClient;
  mapping: CrmFieldMapping;
  meter: <R>(op: MeterOp, fn: () => Promise<R>) => Promise<R>;
  /** Max attempts on a rate-limit error (default 3). */
  maxRetries?: number;
  tenantId: string;
  /** Optional sink for sync results (AC5 logging). */
  logSync?: (result: SyncResult) => void;
}

export interface SyncResult {
  externalKey: string;
  id: string;
  created: boolean;
  properties: Record<string, unknown>;
  attempts: number;
}

/**
 * AC1/AC4/AC5 — sync one entity to the CRM. Upsert is keyed by external id /
 * identity so a re-sync updates rather than duplicates; a rate-limit error is
 * retried (bounded) under the same key; the call is metered and the result
 * returned for logging.
 */
export async function syncToCrm(entity: CrmEntity, deps: SyncDeps): Promise<SyncResult> {
  const adapter = new HubSpotAdapter(deps.client);
  const maxRetries = deps.maxRetries ?? 3;
  const key = entity.externalId ?? entity.identity;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    try {
      const res = await deps.meter(
        { workspace: deps.tenantId, kind: "crm.upsert", provider: "hubspot", amount: 1, ref: `${entity.type}:${key}` },
        () => adapter.syncEntity(entity, deps.mapping),
      );
      const result: SyncResult = { externalKey: key, id: res.id, created: res.created, properties: res.properties, attempts: attempt };
      deps.logSync?.(result);
      return result;
    } catch (e) {
      if (e instanceof CrmRateLimitError && attempt < maxRetries) continue; // idempotent retry under the same key
      throw e;
    }
  }
}
