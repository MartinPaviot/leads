/**
 * Canonical upsert (spec 00, AC1/AC3/AC4). Identity-resolving and merging: an
 * incoming partial is matched to an existing record by registry id → domain →
 * name+country (AC3); on a match the engine merges onto it rather than
 * duplicating. Vendor ids go to the vendor_ids side map, never into identity
 * (AC4). Every provided canonical field is recorded as provenance and the
 * winners are recomputed (AC6). All access is tenant-scoped (AC5) and validated
 * (AC2).
 */
import { db } from "@/db";
import { companies, contacts, accountFieldSource, contactFieldSource } from "@/db/schema";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { requireWorkspace, workspacePredicate } from "./scoped";
import {
  accountIdentityKey,
  accountMatchPlan,
  bareDomain,
  contactIdentityKey,
  contactMatchPlan,
  type AccountIdentityInput,
  type ContactIdentityInput,
} from "./identity";
import { normalizeCompanyName } from "@/lib/companies/identity";
import { recomputeCanonicalFields } from "./field-source";
import {
  accountWriteSchema,
  contactWriteSchema,
  vendorIdsSchema,
  parseOrThrow,
} from "@/validators/canonical";

export interface UpsertAccountInput extends AccountIdentityInput {
  industry?: string | null;
  size?: string | null;
  revenue?: string | null;
  description?: string | null;
  vendorIds?: Record<string, string>;
  provider?: string;
  observedAt?: Date;
}

export interface UpsertContactInput extends ContactIdentityInput {
  title?: string | null;
  phone?: string | null;
  vendorIds?: Record<string, string>;
  provider?: string;
  observedAt?: Date;
}

const ACCOUNT_FIELD_COLUMNS = ["name", "domain", "industry", "size", "revenue", "description"] as const;
const CONTACT_FIELD_COLUMNS = ["email", "firstName", "lastName", "title", "phone", "linkedinUrl"] as const;

function vendorMergeExpr(vendorIds: Record<string, string> | undefined) {
  const json = JSON.stringify(vendorIds ?? {});
  return sql`coalesce(vendor_ids, '{}'::jsonb) || ${json}::jsonb`;
}

// === Accounts ===

async function findAccountMatch(
  tenantId: string,
  input: UpsertAccountInput,
): Promise<string | null> {
  for (const step of accountMatchPlan(input)) {
    if (step.by === "identity_key") {
      const [m] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(workspacePredicate(companies.tenantId, tenantId, eq(companies.identityKey, step.value), isNull(companies.deletedAt)))
        .limit(1);
      if (m) return m.id;
    } else if (step.by === "domain") {
      const v = step.value;
      const [m] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          workspacePredicate(
            companies.tenantId,
            tenantId,
            or(eq(companies.domain, v), eq(companies.domain, `www.${v}`)),
            isNull(companies.deletedAt),
          ),
        )
        .limit(1);
      if (m) return m.id;
    } else {
      // name + country fuzzy: ILIKE first token, compare normalized name; if
      // both sides carry a country and they differ, reject the match.
      const first = step.name.split(" ")[0];
      if (!first || first.length < 2) continue;
      const candidates = await db
        .select({ id: companies.id, name: companies.name, properties: companies.properties })
        .from(companies)
        .where(workspacePredicate(companies.tenantId, tenantId, ilike(companies.name, `%${first}%`), isNull(companies.deletedAt)))
        .limit(10);
      for (const c of candidates) {
        if (normalizeCompanyName(c.name) !== step.name) continue;
        const candCountry = (c.properties as Record<string, unknown> | null)?.country;
        if (step.country && candCountry && String(candCountry) !== step.country) continue;
        return c.id;
      }
    }
  }
  return null;
}

export async function upsertAccount(tenantId: string, input: UpsertAccountInput) {
  const ws = requireWorkspace(tenantId);
  // AC2 — validate the column-bound subset against the drizzle-mirror schema.
  parseOrThrow(accountWriteSchema, {
    name: input.name ?? undefined,
    domain: input.domain ?? undefined,
    industry: input.industry ?? undefined,
    size: input.size ?? undefined,
    revenue: input.revenue ?? undefined,
    description: input.description ?? undefined,
  });
  const vendorIds = input.vendorIds ? parseOrThrow(vendorIdsSchema, input.vendorIds) : undefined;

  const provider = input.provider ?? "manual";
  const observedAt = input.observedAt ?? new Date();
  const identityKey = accountIdentityKey(input);
  const dom = bareDomain(input.domain);

  let entityId = await findAccountMatch(ws, input);

  if (entityId) {
    // Merge onto the matched record: backfill identity key + merge vendor ids.
    await db
      .update(companies)
      .set({
        ...(identityKey ? { identityKey } : {}),
        ...(vendorIds ? { vendorIds: vendorMergeExpr(vendorIds) as never } : {}),
        updatedAt: sql`now()`,
      })
      .where(workspacePredicate(companies.tenantId, ws, eq(companies.id, entityId)));
  } else {
    // No match — insert a new canonical record. name is NOT NULL.
    const [created] = await db
      .insert(companies)
      .values({
        tenantId: ws,
        name: input.name ?? dom ?? "(unknown)",
        domain: dom ?? null,
        identityKey: identityKey ?? null,
        vendorIds: (vendorIds ?? {}) as never,
        sourceSystem: provider,
      })
      .returning({ id: companies.id });
    entityId = created.id;
  }

  // Record provenance for each provided canonical field, then recompute once.
  const values: Record<string, unknown> = {
    name: input.name,
    domain: dom,
    industry: input.industry,
    size: input.size,
    revenue: input.revenue,
    description: input.description,
  };
  const rows = ACCOUNT_FIELD_COLUMNS.filter((f) => values[f] !== undefined && values[f] !== null).map((f) => ({
    tenantId: ws,
    entityId: entityId as string,
    field: f,
    provider,
    value: values[f] as never,
    observedAt,
  }));
  if (rows.length > 0) {
    await db
      .insert(accountFieldSource)
      .values(rows)
      .onConflictDoUpdate({
        target: [accountFieldSource.entityId, accountFieldSource.field, accountFieldSource.provider],
        set: { value: sql`excluded.value`, observedAt: sql`excluded.observed_at` },
      });
  }
  await recomputeCanonicalFields(ws, "account", entityId);

  const [row] = await db
    .select()
    .from(companies)
    .where(workspacePredicate(companies.tenantId, ws, eq(companies.id, entityId)))
    .limit(1);
  return row;
}

// === Contacts ===

async function findContactMatch(
  tenantId: string,
  input: UpsertContactInput,
): Promise<string | null> {
  for (const step of contactMatchPlan(input)) {
    if (step.by === "email") {
      const [m] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(workspacePredicate(contacts.tenantId, tenantId, eq(contacts.email, step.value), isNull(contacts.deletedAt)))
        .limit(1);
      if (m) return m.id;
    } else if (step.by === "linkedin") {
      const [m] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(workspacePredicate(contacts.tenantId, tenantId, ilike(contacts.linkedinUrl, `%${step.value}%`), isNull(contacts.deletedAt)))
        .limit(1);
      if (m) return m.id;
    } else {
      const [m] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(workspacePredicate(contacts.tenantId, tenantId, eq(contacts.identityKey, step.value), isNull(contacts.deletedAt)))
        .limit(1);
      if (m) return m.id;
    }
  }
  return null;
}

export async function upsertContact(tenantId: string, input: UpsertContactInput) {
  const ws = requireWorkspace(tenantId);
  parseOrThrow(contactWriteSchema, {
    email: input.email ?? undefined,
    firstName: input.firstName ?? undefined,
    lastName: input.lastName ?? undefined,
    title: input.title ?? undefined,
    phone: input.phone ?? undefined,
    linkedinUrl: input.linkedinUrl ?? undefined,
    companyId: input.companyId ?? undefined,
  });
  const vendorIds = input.vendorIds ? parseOrThrow(vendorIdsSchema, input.vendorIds) : undefined;

  const provider = input.provider ?? "manual";
  const observedAt = input.observedAt ?? new Date();
  const identityKey = contactIdentityKey(input);

  let entityId = await findContactMatch(ws, input);

  if (entityId) {
    await db
      .update(contacts)
      .set({
        ...(identityKey ? { identityKey } : {}),
        ...(vendorIds ? { vendorIds: vendorMergeExpr(vendorIds) as never } : {}),
        updatedAt: sql`now()`,
      })
      .where(workspacePredicate(contacts.tenantId, ws, eq(contacts.id, entityId)));
  } else {
    const [created] = await db
      .insert(contacts)
      .values({
        tenantId: ws,
        companyId: input.companyId ?? null,
        email: input.email ? input.email.toLowerCase().trim() : null,
        identityKey: identityKey ?? null,
        vendorIds: (vendorIds ?? {}) as never,
        sourceSystem: provider,
      })
      .returning({ id: contacts.id });
    entityId = created.id;
  }

  const values: Record<string, unknown> = {
    email: input.email ? input.email.toLowerCase().trim() : undefined,
    firstName: input.firstName,
    lastName: input.lastName,
    title: input.title,
    phone: input.phone,
    linkedinUrl: input.linkedinUrl,
  };
  const rows = CONTACT_FIELD_COLUMNS.filter((f) => values[f] !== undefined && values[f] !== null).map((f) => ({
    tenantId: ws,
    entityId: entityId as string,
    field: f,
    provider,
    value: values[f] as never,
    observedAt,
  }));
  if (rows.length > 0) {
    await db
      .insert(contactFieldSource)
      .values(rows)
      .onConflictDoUpdate({
        target: [contactFieldSource.entityId, contactFieldSource.field, contactFieldSource.provider],
        set: { value: sql`excluded.value`, observedAt: sql`excluded.observed_at` },
      });
  }
  await recomputeCanonicalFields(ws, "contact", entityId);

  const [row] = await db
    .select()
    .from(contacts)
    .where(workspacePredicate(contacts.tenantId, ws, eq(contacts.id, entityId)))
    .limit(1);
  return row;
}
