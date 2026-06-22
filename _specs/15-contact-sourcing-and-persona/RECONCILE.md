# RECONCILE.md — Spec 15 Contact Sourcing and Persona (T0)

> Read-only reconciliation. The existing sourcing surface is **DB/Apollo-backed and account-side**; spec 15 wants the **pure, deterministic, contact-side** `sourceContacts(account, persona)` selector. Built as the pure delta; existing modules reused (not duplicated, not overloaded).

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Source ONLY from qualified accounts (09) | **partial** | `lib/accounts/sourcing-preview.ts` partitions accounts in/out of ICP by score≥40, but it's a *preview* not the sourcing guard; no contact-side qualified gate |
| AC2 | Filter by persona (titles, seniorities, departments) | **partial** | `lib/icp/person-targeting.ts` resolves persona→Apollo *search params* (impure, DB); `lib/scoring/title-persona.ts` is LLM title→persona (impure, scoring-side). No deterministic structured contact filter |
| AC3 | Per-account cap (default 1–3) | **missing** | No per-account contact cap anywhere |
| AC4 | Dedup by verified email + linkedin_url (07) + anti-collision (14) | **partial** | `lib/dedup/contacts.ts` dedups email→linkedin (reuse its norm), but not wired into sourcing; no anti-collision hook |
| AC5 | Persist canonical contacts with provenance | **partial** | Upsert paths exist (spec-00); sourcing doesn't stamp provenance |

## Reuse inventory (reuse, do not duplicate)
- `lib/dedup/contacts.ts` — contact identity normalization: `email.toLowerCase().trim()`, `linkedin.toLowerCase().replace(/\/+$/,"").trim()`. Spec-15 identity key mirrors it exactly.
- `lib/scoring/score-account.ts` — spec-09 `qualification` partition feeds AC1 (the account input carries `qualification`).
- `lib/icp/person-targeting.ts` + `lib/scoring/title-persona.ts` — the *impure* persona resolvers (DB + LLM). Out of the pure boundary; the caller resolves the persona, passes it in.
- `lib/anti-collision/*` (spec 14) — respected via an **injected `isCollised(identityKey)` predicate** (inject pattern: spec 15 builds off main, decoupled from the unmerged spec-14 branch).

## Decisions (taken, full autonomy)
1. Build `lib/contacts/sourcing/source-contacts.ts` — **pure** `sourceContacts(account, persona, candidates, deps): SourcedContact[]`. Raw provider fetch (Apollo) is the caller's impure step; this selects deterministically. Honors the `Forbidden: role/email logic` blast radius.
2. **AC2 deterministic, not LLM:** seniority/department exact norm-match, title norm-substring match (the LLM title→persona path stays scoring-side). Empty persona facet = no constraint on that facet.
3. **Pipeline:** AC1 qualified gate → drop unidentifiable (no email & no linkedin) → AC2 persona filter → AC4 dedup by identity (verified email > linkedin > unverified email) + skip `alreadySourced` (cross-account/campaign) + skip `isCollised` (14) → AC3 cap (rank desc, externalId asc) → AC5 provenance stamp.
4. **No schema** (identity/upsert injected) → mergeable off main.
