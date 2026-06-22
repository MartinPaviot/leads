# 06 — Sourcing: Registries (SIRENE / Pappers / Zefix)

> Feature-spec. Inherits `/spec/steering`. Brownfield: T0 is reconciliation. Strategic: this is the owned, resale-clean data and the francophone identity anchor. Treat it as a first-class source, not an afterthought.

## requirements.md

**Context.** Sources and identity-anchors FR/CH accounts from official registries (data-contract identity resolution; methodology M3 registry layer). This is the data Elevay can bundle and resell cleanly, unlike vendor databases. Depends on 00, 01, 02. Depended on by 07 (identity), 08 (registry as an enrichment source).

**Story.** As the engine, I want to source and identity-anchor FR/CH accounts from official registries, so I hold owned data and a legal-id identity key that domain-only matching misses.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL implement registry adapters behind the port: SIRENE/Pappers (FR) keyed by SIREN/SIRET, Zefix (CH) keyed by UID.
- AC2. WHEN sourcing FR/CH geographies, THE SYSTEM SHALL return `CanonicalAccount`s carrying the `legal_id` identity and registry firmographics (legal name, activity code, headcount band, address).
- AC3. THE SYSTEM SHALL map FR NAF/APE and CH NOGA codes to the canonical industry (NAICS label) via the normalizers.
- AC4. THE SYSTEM SHALL meter calls, respect budget, and cache registry results with a long TTL (registry data is stable).
- AC5. THE SYSTEM SHALL expose a field-level enrichment path (`enrichFromRegistry`) so 08 can use a registry as a waterfall provider, not only a bulk source.

**Out of scope.** Cross-provider dedup/merge (07), waterfall ordering (08), non-FR/CH registries.

**Open questions.** Access path (INSEE SIRENE API vs Pappers API; Zefix API) and any existing registry code. Reconcile and confirm.

## design.md

**Data slice.** Output `CanonicalAccount` with `identity.legal_id` set; firmographic fields.

**Interfaces.** `sourceFromRegistry(segment): AsyncIterable<CanonicalAccount>`; `enrichFromRegistry(account, fields): FieldResult[]`. Both behind the 01 port.

**Determinism boundary.** Fully deterministic. Code mapping (NAF/NOGA → NAICS) is a table, not agentic.

**Error & idempotency.** Identity = `legal_id`. Long-TTL cache via the field-source table. Upsert by identity.

**Blast radius.** `sourcing/registry/*`, plus the NAF/NOGA→NAICS table under `providers/normalizers/`. Forbidden: `/spec/steering`.

## tasks.md

- T0 (reconcile): audit existing registry code and the normalizer tables against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`.
- T1 (test-first): SIREN/UID identity anchoring; NAF→NAICS and NOGA→NAICS mapping; cache TTL.
- T2: SIRENE/Pappers adapter. DoD: AC1 (FR), AC2 green.
- T3: Zefix adapter. DoD: AC1 (CH) green.
- T4: activity-code → industry mapping + long-TTL cache + metering. DoD: AC3, AC4 green.
- T5: field-level `enrichFromRegistry` path. DoD: AC5 green. `=== GATE: first live registry call ===`.

## eval.md

- Deterministic: `pnpm test sourcing:registry` green against fixtures; identity anchoring and code mapping proven; cache TTL respected.
- Self-verify: `pnpm test sourcing:registry && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; FR and CH both anchored on legal id; `RECONCILE.md` committed.
