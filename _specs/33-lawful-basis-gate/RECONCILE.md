# RECONCILE.md — Spec 33 Lawful Basis Gate (T0)

> Read-only reconciliation. No lawful-basis / data-provenance gate exists. A hard gate read by the senders; ties to the Apollo-resale/ToS constraint (owned registry data is clean, provider data carries its source's limits). Block is the default.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Record a lawful basis (LI+assessment / consent); block if none | **missing** | No basis record / gate |
| AC2 | Source-provenance: prohibited-source blocked, registry passes | **missing** | No source-policy table |
| AC3 | Every message includes opt-out; honor via suppression (22/26) | **partial** | `email-spam-check` flags missing-unsubscribe; no hard compliance gate |
| AC4 | Log basis + provenance for audit | **missing** | — |
| AC5 | Per-jurisdiction rules (FR/CH/EU) | **missing** | — |

## Reuse inventory
- spec-00 field-source provenance (the contact's `source`); spec-22 suppression (honors opt-out) — referenced.

## Decisions (taken, full autonomy)
1. Build `lib/compliance/lawful-basis/*` (blast radius `compliance/lawful-basis/*`): `policy.ts` (source + jurisdiction tables), `gate.ts` (`assertLawfulBasis`, opt-out checks), `index.ts`, tests. Pure function of contact + policy.
2. **AC2 source policy:** registry/owned (sirene, pappers, zefix, recherche-entreprises, manual) → `clean`; provider/resale (apollo, hunter, lusha, kaspr, zeliq) → `prohibited`; **unknown → prohibited (block by default)**.
3. **AC1/AC5:** `assertLawfulBasis` blocks when no basis; an LI without a documented assessment or a consent without a record is invalid; the basis type must be acceptable for the jurisdiction (FR/CH/EU allow LI+consent; **unknown jurisdiction → consent only**).
4. **AC3:** `hasOptOut(body)` + `assertMessageOptOut(body, jurisdiction)` — a message must carry the opt-out mechanism (honored by spec-22/26 suppression).
5. **AC4:** the `Allowed` result carries basis + provenance for the caller to audit-log.
6. **No schema** (basis/source on the contact, policy in-module) → mergeable off main.
