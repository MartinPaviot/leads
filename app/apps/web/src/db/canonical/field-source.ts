/**
 * Provenance writes + canonical recompute (spec 00, AC6). Writing a
 * *_field_source row is idempotent on (entity, field, provider) and triggers a
 * recompute of the entity's canonical_fields by provider precedence, mirroring
 * the winners onto the scalar columns. All access is tenant-scoped (AC5).
 */
import { db } from "@/db";
import { companies, contacts, accountFieldSource, contactFieldSource } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireWorkspace, workspacePredicate } from "./scoped";
import {
  computeCanonicalFields,
  projectScalars,
  ACCOUNT_CANONICAL_FIELDS,
  CONTACT_CANONICAL_FIELDS,
  type FieldSourceRow,
} from "./canonical-fields";

export type CanonicalEntityType = "account" | "contact";

function tablesFor(entityType: CanonicalEntityType) {
  return entityType === "account"
    ? { entity: companies, source: accountFieldSource, fields: ACCOUNT_CANONICAL_FIELDS }
    : { entity: contacts, source: contactFieldSource, fields: CONTACT_CANONICAL_FIELDS };
}

export interface WriteFieldSourceInput {
  tenantId: string;
  entityType: CanonicalEntityType;
  entityId: string;
  field: string;
  provider: string;
  value: unknown;
  observedAt?: Date;
}

/**
 * Upsert one provenance row, then recompute the entity's canonical_fields.
 * Re-asserting a (field, provider) updates value + observed_at; it never
 * duplicates (AC1 unique constraint).
 */
export async function writeFieldSource(input: WriteFieldSourceInput): Promise<void> {
  const tenantId = requireWorkspace(input.tenantId);
  const { source } = tablesFor(input.entityType);
  const observedAt = input.observedAt ?? new Date();

  await db
    .insert(source)
    .values({
      tenantId,
      entityId: input.entityId,
      field: input.field,
      provider: input.provider,
      value: input.value as never,
      observedAt,
    })
    .onConflictDoUpdate({
      target: [source.entityId, source.field, source.provider],
      set: { value: input.value as never, observedAt },
    });

  await recomputeCanonicalFields(tenantId, input.entityType, input.entityId);
}

/**
 * Recompute canonical_fields from all provenance rows for one entity and mirror
 * the winning values onto the scalar columns. Tenant-scoped read + write.
 */
export async function recomputeCanonicalFields(
  tenantId: string,
  entityType: CanonicalEntityType,
  entityId: string,
): Promise<void> {
  const ws = requireWorkspace(tenantId);
  const { entity, source, fields } = tablesFor(entityType);

  const rows = await db
    .select({
      field: source.field,
      provider: source.provider,
      value: source.value,
      observedAt: source.observedAt,
    })
    .from(source)
    .where(workspacePredicate(source.tenantId, ws, eq(source.entityId, entityId)));

  const canonical = computeCanonicalFields(rows as FieldSourceRow[]);
  const patch = projectScalars(canonical, fields);

  await db
    .update(entity)
    .set({ canonicalFields: canonical as never, ...patch, updatedAt: sql`now()` })
    .where(workspacePredicate(entity.tenantId, ws, eq(entity.id, entityId)));
}
