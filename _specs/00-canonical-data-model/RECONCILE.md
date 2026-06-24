# RECONCILE.md — Spec 00 Canonical Data Model (T0)

> Read-only reconciliation. No code changed. Verdicts cite `file:line` verified against current HEAD (`feat/outbound-migrations`). Method: 5-finder fan-out audit + manual citation spot-checks of the load-bearing claims.

## Gate status: BLOCKED on a structural prerequisite

`=== GATE: reconciliation ===` — awaiting your decision. The spec declares `/spec/steering` and `data-contract.md` as the authoritative shape source. **Neither exists on disk.** Verified: recursive search for `*data-contract*` and any `steering` dir across the whole repo (excluding `node_modules`) returns nothing; there is no `/spec` dir at root, `app/`, or `app/apps/web` — only `_specs/` and `_harness/`. The spec text even hedges (`_specs/00-canonical-data-model.md:25` "data-contract.md ... which may be missing"). Consequence: AC1/AC2/AC3/AC6 cannot be resolved to "already-satisfied" against an authoritative shape, because there is no authority to verify against. This is the single highest-priority unblock and a real `conflict`, not a missing file I can silently invent.

## Naming reconciliation (the spec's terms vs this repo)

| Spec term | This repo | Evidence |
|---|---|---|
| `CanonicalAccount` | `companies` table | `app/apps/web/src/db/schema/core.ts:52` |
| `CanonicalContact` | `contacts` table | `app/apps/web/src/db/schema/core.ts:160` |
| `ICPQuery` | `icps` + `icp_criteria` + `icp_field_catalog` | `app/apps/web/src/db/schema/icp.ts:32,74,113` |
| `OutreachLead` | **no equivalent** (activity rows only: `sequence_enrollments`, `sequence_drafts`) | `app/apps/web/src/db/schema/outbound.ts:92,129` |
| `workspace_id` | `tenant_id` (FK→`tenants.id`, NOT NULL) | `app/apps/web/src/db/schema/core.ts:56` |

## Verdict summary

| AC | What it requires | Verdict | One-line |
|---|---|---|---|
| AC1 | `CanonicalAccount`/`CanonicalContact` + `*_field_source` tables | **partial** | Account/Contact exist as `companies`/`contacts`; **no** `*_field_source` tables, **no** `canonical_fields` |
| AC2 | Zod that **mirrors** Drizzle, rejects invalid writes | **missing** | No `drizzle-zod`; 2 of ~25+ write sites validate, both hand-written partial schemas |
| AC3 | Identity `domain → legal_id → name+country fuzzy`, **merge** | **partial** | Domain dedup everywhere; legal_id tier in **no** live path; clean helper exists but orphaned |
| AC4 | `vendor_ids` side map, never in identity | **conflict** | No side map; vendor ids live in `properties` bag; `apollo_id` promoted to a live matching key |
| AC5 | Scope by `workspace_id`, **reject** unscoped query | **partial** | `tenant_id` column + RLS present, but RLS is fallback-**permissive**; enforcement is convention |
| AC6 | On `*_field_source` write, recompute `canonical_fields` by precedence | **missing** | No `canonical_fields`, no `*_field_source`, no recompute — last-writer-wins scalars |
| — | Steering / `data-contract.md` authority | **conflict** | Authoritative shape source absent (the blocker above) |
| — | Migration mechanism + `0082` | **satisfied** | Custom runner healthy, additive/idempotent, `0082` is latest |
| — | String-distance library vendored? | **missing** | None as a direct dep anywhere (web/admin/worker/root) |

---

## AC1 — Canonical entities + provenance tables — `partial`

- `companies` (`core.ts:52-113`) and `contacts` (`core.ts:160-192`) cover the account/contact concept, tenant-scoped, with `properties jsonb` catch-all (`core.ts:63`, `core.ts:172`).
- **No** `account_field_source` / `contact_field_source` provenance tables exist anywhere.
- The only provenance-like structure is `intelligenceBriefs.firmographicProvenance` (`campaign.ts:46`) — a flat jsonb array typed by `FieldProvenance {field, provider}` (`lib/campaign-engine/types.ts:25-28`), scoped to a **research-brief cache**, not a per-field ledger over the account/contact entity, and never used to recompute entity fields.
- **Delta:** add `account_field_source` + `contact_field_source` (row per `entity+field+provider` with value + provider + observed_at) keyed to `companies`/`contacts`. Blocked on `data-contract.md` to fix exact column shapes.

## AC2 — Zod mirrors Drizzle, rejects invalid — `missing`

- `drizzle-zod` is **not** a dependency; `createInsertSchema`/`createSelectSchema` appear **nowhere** (verified: zero hits across `app/`). `zod ^4.4.3` is present (`app/apps/web/package.json`) but used only for hand-authored partial validators.
- Only 2 write sites validate: `POST /api/accounts` (`api/accounts/route.ts:16` — 3 fields: name/domain/properties) and `POST /api/contacts` (`api/contacts/route.ts:16`). Both are hand-written `z.object()` covering a **subset** of columns; the accounts schema omits `industry`, `size`, `revenue`, `score`, `ownerId`, `sourceSystem`, etc. — so they do **not** mirror the Drizzle shape.
- The dominant write paths bypass Zod entirely and go straight to Drizzle `.values(...)`: enrichment (`lib/enrichment/enrich-company-row.ts:202`), import (`lib/import/agentic-executor.ts:185,231`), TAM, sync/inngest, webhooks, chat tools — `lib/chat/tool-call-log.ts:433` even inserts `row as any`.
- **Delta:** add `drizzle-zod`, generate insert schemas for `companies`/`contacts` (+ `*_field_source` once they exist), and route **every** write through one `safeParse`-then-insert helper. Requires an authoritative shape to mirror.

## AC3 — Identity resolution + merge — `partial`

- There is **no** single `upsertAccount`/`resolveAccountIdentity` entry point. Account writes are spread across ≥4 independent paths with different dedup logic:
  1. `POST /api/accounts` → blind `db.insert(companies)`, **zero** dedup (`api/accounts/route.ts:444`).
  2. TAM pipeline → in-memory `existingDomains` Set, domain-only, **skips** (never merges) (`lib/tam-stream/per-company.ts:102`).
  3. smart-import → skip-on-domain-match or insert (`api/import/smart/commit/route.ts:97`).
  4. agentic CSV import → the **only** merging path, fill-empty only, gated behind a `dedup` flag (`lib/import/agentic-executor.ts:207-228`).
- The live resolver `findCompanyDuplicate` (`lib/import/dedup.ts:71-153`) implements `domain → fuzzy_name` and **omits the legal_id tier entirely**. Its "Levenshtein-like" branch is substring containment, not edit distance (`dedup.ts:137-148`).
- A clean, fuller-precedence helper **already exists and is tested** — `canonicalIdentityKey` (`lib/companies/identity.ts:54-64`): `fr:siren → ch:uid → d:domain → n:name`, with `normalizeCompanyName` stripping legal suffixes/accents (`identity.ts:27-40`). **But it is orphaned** — used only by `scripts/cleanup-accounts.ts` and `__tests__/company-identity.test.ts`, never in a runtime write (verified: 3 files total).
- "name+country fuzzy" is name-only; country is in **no** matching key.
- No unique constraint on `companies` for `(tenant_id, domain)` — `companies_domain_idx` is a plain `index(...)` (`core.ts:101`), so duplicate prevention is best-effort app-side.
- **Delta:** one canonical `upsertAccount` calling a `resolveAccountIdentity` with the full domain → legal_id → name+country tiering (extend `identity.ts`), merge-with-precedence (not fill-empty), route the 4 paths through it, add a DB unique/onConflict on the identity. **Reuse `canonicalIdentityKey` as the seed** — most of the hard part is already written.

## AC4 — `vendor_ids` side map — `conflict`

- **No** `vendor_ids` map exists (verified: zero hits for `vendor_ids|vendorIds` in `app/`).
- Vendor ids live **inside** the generic `properties` jsonb, commingled with firmographics: `properties.apollo_id` set in TAM (`lib/tam/candidate.ts:36-43`, `lib/tam-stream/per-company.ts:439-443`). This is the opposite of "never inside identity / kept in a side map".
- The clean part: `canonicalIdentityKey` never falls through to `apollo_id` (`identity.ts:54-64`).
- The leak: `accountSuppressions.nativeId` is commented "SIREN / Zefix UID / **Apollo id**" (`core.ts:140`), and `suppression.ts:85-88` promotes `apollo_id` to a `nativeId` matching key used in live suppression matching — a vendor id elevated to identity-grade in a live path.
- **Delta:** add a dedicated `vendor_ids` side map (jsonb column or `vendor_account_ids` child table keyed by `(entity_id, vendor, vendor_id)`); migrate the `apollo_id`/`linkedin_url` writers out of `properties`; stop using `apollo_id` as a suppression `nativeId`.

## AC5 — Tenant scoping + reject unscoped query — `partial`

- Column half **satisfied**: every canonical table carries `tenant_id` (FK→`tenants.id`, NOT NULL) with an index — `companies` (`core.ts:56,100`), `contacts` (`core.ts:164,184`).
- Reject half **not satisfied**: the applied RLS policies are the **fallback-permissive** 0074 form — when no `app.tenant_id` context is bound, the policy allows everything (`drizzle/0000_baseline.sql:7744-7765`; rationale in `drizzle/_archive/0074_rls_enforced.sql:8-14`). The only context-binding primitive, `withTenantTx`, is wired in just 4 non-test files (`lib/inbox/load.ts`, `lib/auth/auth-utils.ts`, `db/rls.ts`, `auth.ts`) — **not** the canonical read/write paths, which rely on developer-remembered `WHERE tenant_id = ?` (`db/rls.ts:19-26` documents this explicitly).
- Strict (rejecting) RLS exists only behind `0081_rls_strict_inbox.sql` (marked **DO NOT APPLY**, env `INBOX_RLS_TX=1`), scoped to inbox-read tables. Not active in prod (consistent with memory `project_pr277-deconflict`).
- There is **no** `scopedQuery`/`withWorkspace` wrapper that throws on a missing predicate.
- **Delta:** introduce one enforced scoping layer — either flip canonical RLS to strict + route writes through `withTenantTx`, or add a central `withWorkspace`/`scopedQuery` helper over `companies`/`contacts` that throws when no tenant predicate is supplied. This is the largest blast-radius item (20+ call sites). Note hazard: a select-all under strict RLS without a bound context 500s/returns-nothing — see memory `reference_prod-schema-behind-drizzle`.

## AC6 — Recompute `canonical_fields` on `*_field_source` write — `missing`

- No `canonical_fields` concept anywhere — no column, no projection, no materialized table — and no `*_field_source` table whose write could trigger a recompute (zero schema hits).
- Canonical values today are last-writer-wins scalar columns on `companies`/`contacts` (`core.ts:58-62`) overwritten directly by enrichment/upsert; no provider precedence.
- **Delta:** add `*_field_source` (entity, field, provider, value, observed_at) + a `canonical_fields` projection + a recompute that picks the winning value by provider precedence on each source write. Entire substrate is new.

## Open questions resolved

- **String-distance library vendored?** No. None of `fastest-levenshtein`/`leven`/`string-similarity`/`natural`/`fast-fuzzy`/`jaro-winkler`/`fuse.js` is a direct dep in web/admin/worker/root. `fast-levenshtein` + `damerau-levenshtein` exist in `pnpm-lock.yaml` but transitive-only (eslint tooling, no `specifier:` importer). The AC3 fuzzy tier has no library backing.
- **Migration state.** Healthy. Custom runner is `app/apps/web/scripts/apply-migrations.ts` (not `src/lib/migrations/`), applies every `drizzle/*.sql` in numeric order inside per-file transactions, tracked in `__elevay_migrations`. `0082_outbound_persistence_batch.sql` is the latest numbered migration. `db:migrate` is intentionally disabled (`package.json:16`). Two stale comments to ignore: CLAUDE.md says "journal stops at idx 12" (actual `_journal.json` idx is 14) and the runner header says "41 SQL files" (6 live files now; 81 consolidated into `0000_baseline.sql` + `drizzle/_archive/`). Neither affects correctness; T5's "run a migration on the dev DB" just adds one `NNNN_*.sql`.

---

## Reuse inventory (build the delta on these, don't rebuild)

- `lib/companies/identity.ts` — `canonicalIdentityKey` + `normalizeCompanyName` + `auditAccountQuality`. Pure, tested, vendor-id-free. **Seed for AC3/AC4.**
- `lib/import/dedup.ts` — `findCompanyDuplicate`/`findContactDuplicate` live resolvers (domain + name). Extend with the legal_id tier rather than replace.
- `lib/import/agentic-executor.ts` — the one existing merge path; generalize fill-empty → precedence-merge.
- `lib/campaign-engine/types.ts:FieldProvenance` — the provenance shape vocabulary to reuse for `*_field_source`.
- `withTenantTx` + 0074/0081 RLS scaffolding — the enforcement primitives for AC5.
- `scripts/apply-migrations.ts` — the migration path for T2/T5.

## Decisions needed at this gate (yours to make)

1. **`data-contract.md` authority (the blocker).** Pick one:
   - **(a, recommended)** I author `_specs/00-canonical-data-model/data-contract.md` (or `/spec/steering/data-contract.md`) defining `CanonicalAccount`/`CanonicalContact`/`*_field_source`/`vendor_ids`/`canonical_fields` shapes, anchored on the live `companies`/`contacts` columns, as a **separate gated step** before T2. Trade-off: ~adds one short cycle before any schema work; benefit: AC1/AC2/AC6 become verifiable.
   - **(b)** Treat the current Drizzle `companies`/`contacts` as the de-facto contract and proceed without authoring it. Trade-off: faster, but AC1/AC2 stay "no authoritative mirror" forever and future specs inherit the ambiguity.
   - **(c)** You provide the data-contract.
2. **Naming.** Alias-in-place (keep `companies`/`contacts`/`tenant_id`, map names in the canonical layer) vs rename tables to `CanonicalAccount`/`CanonicalContact`/`workspace_id`. **Recommend alias-in-place** — a rename touches 37+ write sites and every query; the spec's value is the contract + provenance, not the table name.
3. **AC5 enforcement strategy.** Strict global RLS + `withTenantTx` everywhere (largest blast radius, prod-hazard per `0081`) vs a central `withWorkspace`/`scopedQuery` helper scoped to the canonical layer. **Recommend the scoped helper** — it makes "reject unscoped query" a hard guard without re-litigating global RLS.
4. **OutreachLead.** Add a dedicated canonical entity (stable lead identity over contact+campaign+stage+source), or rule it out of spec 00's scope and defer to the outbound specs (03/04). **Recommend deferring** — enrollment/draft rows already cover the activity; a canonical lead identity is a bigger design owned by orchestration.

**I will implement nothing until you approve this map.** Reply `Approved` (optionally with edits), or tell me how to resolve decisions 1–4.
