/**
 * Spec 28 — HubSpot adapter behind the spec-01 provider pattern. Maps canonical
 * entities to HubSpot properties (managed fields only — never clobber CRM-owned
 * fields) and upserts by external id / identity. The HTTP client is injected.
 * Blast radius: providers/hubspot/* only.
 */

export type CrmEntityType = "account" | "contact";

export interface CrmEntity {
  type: CrmEntityType;
  /** Stable identity (domain / email) used as the upsert key when no externalId. */
  identity: string;
  /** HubSpot object id if already known. */
  externalId?: string;
  fields: Record<string, unknown>;
}

export interface CrmFieldMapping {
  /** canonical field → HubSpot property name. */
  map: Record<string, string>;
  /** Canonical fields the engine MANAGES. Anything else is CRM-owned and never written (AC3). */
  managed: string[];
}

/**
 * AC3 — project an entity to the HubSpot properties we are allowed to write:
 * only `managed` fields that are present, mapped to their CRM property names.
 */
export function mapManagedFields(fields: Record<string, unknown>, mapping: CrmFieldMapping): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of mapping.managed) {
    const v = fields[field];
    if (v === undefined) continue;
    out[mapping.map[field] ?? field] = v;
  }
  return out;
}

/** Thrown by the client on a 429 so the sync layer can retry idempotently. */
export class CrmRateLimitError extends Error {
  readonly retryAfterMs?: number;
  constructor(message = "rate limited", retryAfterMs?: number) {
    super(message);
    this.name = "CrmRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export interface HubSpotClient {
  /** Upsert by `externalKey` (externalId or identity). Idempotent on the key. */
  upsert(type: CrmEntityType, externalKey: string, properties: Record<string, unknown>): Promise<{ id: string; created: boolean }>;
  updateDealStage?(externalId: string, stage: string): Promise<void>;
}

export function upsertKey(entity: CrmEntity): string {
  return entity.externalId ?? entity.identity;
}

export class HubSpotAdapter {
  constructor(private readonly client: HubSpotClient) {}

  /** Map managed fields and upsert. Throws CrmRateLimitError on 429 (caller retries). */
  async syncEntity(entity: CrmEntity, mapping: CrmFieldMapping): Promise<{ id: string; created: boolean; properties: Record<string, unknown> }> {
    const properties = mapManagedFields(entity.fields, mapping);
    const res = await this.client.upsert(entity.type, upsertKey(entity), properties);
    return { ...res, properties };
  }

  async updateDealStage(externalId: string, stage: string): Promise<void> {
    await this.client.updateDealStage?.(externalId, stage);
  }
}
