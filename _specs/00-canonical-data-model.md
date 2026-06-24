# 00 — Canonical Data Model

> Feature-spec. Inherits `/spec/steering` (data-contract.md is authoritative for shapes). Brownfield: T0 is reconciliation, never a rebuild. Outcome-oriented, not a file recipe.

## requirements.md

**Context.** Implements the canonical entities and identity resolution defined in `data-contract.md`. Foundation: every other spec reads and writes these shapes. Depends on the app scaffold (Next.js / Drizzle / Neon / Upstash). Depended on by: all.

**Story.** As the engine, I want the canonical Account, Contact, ICPQuery and OutreachLead persisted with stable identity keys, so every module operates on one consistent shape instead of vendor-specific records.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL persist `CanonicalAccount`, `CanonicalContact`, and their `*_field_source` provenance tables exactly as shaped in data-contract.md.
- AC2. THE SYSTEM SHALL validate every write against a Zod schema that mirrors the Drizzle schema, and SHALL reject invalid writes.
- AC3. WHEN an account is upserted, THE SYSTEM SHALL resolve identity in order domain → legal_id (SIREN/SIRET, CH UID) → normalized name+country fuzzy, and SHALL merge onto the matched record rather than create a duplicate.
- AC4. THE SYSTEM SHALL store vendor ids in a `vendor_ids` side map, never inside the identity.
- AC5. THE SYSTEM SHALL scope every row by `workspace_id` and SHALL reject any query lacking a workspace predicate.
- AC6. WHEN a `*_field_source` row is written, THE SYSTEM SHALL recompute `canonical_fields` by provider precedence.

**Out of scope.** Enrichment logic (08), sourcing (05/06), scoring (09), email finding (17).

**Open questions.** Current schema/migration state (reconcile answers it). Is a string-distance library already vendored.

## design.md

**Data slice.** The full canonical entities; shapes are authoritative in data-contract.md, do not redefine here.

**Interfaces.**
- `upsertAccount(ws, partial): Promise<Account>` (identity-resolving, merging)
- `upsertContact(ws, partial): Promise<Contact>`
- `writeFieldSource(entity, field, src): Promise<void>` (recomputes canonical)
- `resolveAccountIdentity(partial): IdentityKey`

**Determinism boundary.** Fully deterministic. Fuzzy name matching is normalized string distance, not an agentic step.

**Error & idempotency.** `upsert*` idempotent on identity key. `*_field_source` unique on `(entity, field, provider)`. Merge is order-independent.

**Blast radius.** Create/edit under `db/schema/*`, `db/canonical/*`, `validators/*`. Forbidden: `/spec/steering`, any module folder.

## tasks.md

- T0 (reconcile): audit existing Drizzle schema, migrations, and any identity/dedup code against AC1–AC6 → `RECONCILE.md`. `=== GATE: reconciliation ===`.
- T1 (test-first, delta only): tests for the unmet criteria, including the identity-merge and tenant-predicate cases.
- T2: bring schema + migrations to target for missing tables/columns, reusing existing ones. DoD: AC1, AC5 green.
- T3: Zod validators mirroring the schema. DoD: AC2 green.
- T4: identity resolution + merge, reusing existing normalizers if present. DoD: AC3, AC4 green.
- T5: canonical recompute on source write. DoD: AC6 green. `=== GATE: runs a migration on the dev DB ===`.

## eval.md

- Deterministic: `pnpm test canonical` green; migration applies cleanly on a fresh dev DB; tenant-scoping test proves no query without `workspace_id` passes.
- Self-verify: `pnpm test canonical && pnpm typecheck && pnpm lint && pnpm db:migrate:dev`.
- DoD: AC1–AC6 green; no existing migration rewritten without an approved gate; `RECONCILE.md` committed.
