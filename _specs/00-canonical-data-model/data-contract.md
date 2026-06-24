# data-contract.md — Canonical Data Model (authoritative shapes)

> Authored at the spec-00 reconciliation gate to fill the missing `/spec/steering/data-contract.md`. Anchored on the live Drizzle tables (`companies`, `contacts`) — this is a brownfield contract over existing data, **alias-in-place**: `CanonicalAccount = companies`, `CanonicalContact = contacts`, `workspace_id = tenant_id`. No table renames. Promote this file to `/spec/steering/` when that dir is created.

## Entities

### CanonicalAccount (`companies`)

Existing columns are unchanged. Spec-00 adds three canonical columns:

| Column | Type | Meaning |
|---|---|---|
| `identity_key` | `text` nullable | The dedup key, registry-first: `fr:<siren>` · `ch:<uid>` · `d:<bare-domain>` · `n:<normalized-name>`. Unique per `(tenant_id, identity_key)` where not null and not soft-deleted. Never derived from a vendor id. |
| `vendor_ids` | `jsonb` default `{}` | Side map `{ [provider]: string }`, e.g. `{ "apollo": "5f3…", "linkedin": "https://…" }`. **Never** part of identity. Replaces ad-hoc `properties.apollo_id`. |
| `canonical_fields` | `jsonb` default `{}` | Precedence-resolved projection `{ [field]: { value, provider, observed_at } }`. Recomputed on every `*_field_source` write. The winning `value` is also mirrored onto the scalar column (`name`, `industry`, …) so existing readers benefit. |

Tracked canonical scalar fields (mirrored from `canonical_fields`): `name`, `domain`, `industry`, `size`, `revenue`, `description`.

### CanonicalContact (`contacts`)

Same three additions. Identity key, email-first: `e:<lower-email>` · `li:<linkedin-path>` · `nc:<normalized-name>@<company_id>`. Tracked scalar fields: `email`, `first_name`, `last_name`, `title`, `phone`, `linkedin_url`.

### account_field_source / contact_field_source (provenance ledger)

One row per `(entity, field, provider)` — the source-of-truth log that `canonical_fields` is recomputed from.

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | uuid |
| `tenant_id` | `text` NOT NULL | FK→`tenants.id`; scoping |
| `entity_id` | `text` NOT NULL | FK→`companies.id` / `contacts.id` |
| `field` | `text` NOT NULL | canonical field name |
| `provider` | `text` NOT NULL | source provider (see precedence) |
| `value` | `jsonb` | the value this provider asserted for the field |
| `observed_at` | `timestamptz` NOT NULL | when the provider asserted it; tie-breaker |
| `created_at` | `timestamptz` default now | |

Unique constraint: `(entity_id, field, provider)` — re-asserting a `(field, provider)` updates the row (upsert), it does not duplicate.

## Provider precedence (highest wins; tie → newest `observed_at`)

```
manual        100   user-entered, always wins
zefix          80   official CH registry
sirene         80   official FR registry (INSEE)
pappers        78   FR registry aggregator
insee          80
apollo         50   vendor enrichment
tam            45   sourcing pipeline
csv            40   bulk import
inbound        40   captured from inbound
inferred / llm 20   model-derived
<unknown>      30   default rank for unlisted providers
```

A field's canonical value = the `*_field_source` row for that field with the highest provider rank; ties broken by most-recent `observed_at`.

## Identity resolution (matching an incoming partial to an existing record)

Resolution tries the strongest available signal first, then falls back:

1. **Registry id** — SIREN / SIRET / CH-UID present → match on `(tenant_id, identity_key=fr:…|ch:…)`. Authoritative; returns immediately.
2. **Domain** — bare domain → match on `(tenant_id, domain)`.
3. **Name + country fuzzy** — normalized name equality within the same country.

On a match, the engine **merges** onto that record (writes field_source + recomputes), never inserts a duplicate. On no match, it inserts a new record and seeds its field_source rows.

**Deviation from the spec's literal "domain → legal_id → fuzzy" order, and why:** registry id is the most authoritative identity (the existing tested helper `lib/companies/identity.ts:canonicalIdentityKey` already keys registry-first, and two records sharing a SIREN are the same legal entity even across different domains). Spec 00's order is the *availability* order (domain is the most commonly present field); confidence order is registry → domain → name. We resolve registry-first to reuse the tested helper and avoid wrongly splitting a rebrand across two domains. Stored `identity_key` is therefore registry-first.

## Invariants

- Every write to a canonical entity or field-source row goes through `db/canonical/*`, is validated against a drizzle-zod schema that mirrors the table (AC2), and is tenant-scoped via `requireWorkspace` (AC5) — a write/query without a tenant predicate throws.
- `upsert*` is idempotent on `identity_key`. `writeFieldSource` is idempotent on `(entity, field, provider)`. Merge is order-independent (precedence + observed_at fully determine the winner).
- Vendor ids live only in `vendor_ids`; identity never reads them.
