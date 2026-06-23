# RECONCILE.md — Spec 11 ICP Model Store and NL-to-ICP (T0)

> Read-only reconciliation, 5-finder audit. The ICP store has no versioning (edits mutate in place + destroy prior criteria), and the NL→ICP paths are split (free-text persona vs catalog-constrained infer), neither doing the full chain. **Schema-changing** (versions) → parks.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Versioned ICP; edit → new version, retain prior | **missing** | `icps` is one mutable row + status enum; PATCH `update`+`delete`-replaces criteria wholesale (`api/icps/[id]:84-104`) — prior version irrecoverable; no `version`/`icp_versions` |
| AC2 | NL description → draft ICP via agent, operable-only, review-before-active | **partial** | `/api/icp/parse-nl` (free-text → persona, **not** catalog-constrained, no weights, writes active) + `/api/icps/infer` (catalog+weighted+draft but **not** NL); no `createIcpFromDescription`, no `runAgent` |
| AC3 | Mark non-operable criteria + warn | **partial** | `icp_field_catalog.source` distinguishes `apollo_search`/`post-filter`; not surfaced as a per-criterion operable flag |
| AC4 | Exclusion (negative-ICP) hard-filter criteria | **partial** | `icp_criteria.isRequired` is a hard filter, but no `isExclusion`/negative semantics |
| AC5 | NL→ICP eval (operable-only, valid schema) before draft shown | **partial** | `validation.ts:validateIcpInput` validates against the catalog; not wired as the NL→ICP agent's eval gate |

## Reuse inventory
- `db/schema/icp.ts` — `icps` + `icp_criteria` (`fieldKey/operator/value/weight/isRequired`) + `icp_field_catalog` (the operable-field source-of-truth).
- `db/schema/intelligence.ts:415` `agent_prompt_versions` (`version`+`parentVersionId`) — the **versioning pattern** to mirror.
- `lib/icp/validation.ts:validateIcpInput` + `field-catalog.ts STANDARD_FIELDS` (`source`) — operability + the AC5 validator.
- `/api/icp/parse-nl` prompt — the NL extraction seed (rewire onto `runAgent` + catalog constraint).
- spec-04 `runAgent` (parked, **injected**); spec-09 `Qualification`/criterion shapes.

## Decisions (taken, full autonomy)
1. **AC1 — add `icp_versions`** (id, tenant_id, icp_id, version int, name, criteria jsonb snapshot, status, created_at, superseded_at) + migration `0087`. `saveIcpVersion` inserts a NEW immutable version + marks the prior superseded; `getActiveIcp` reads the active version. Prior versions retained.
2. **AC2/AC5 — `createIcpFromDescription(text, deps)`** via the **injected** `runAgent` (kind `nl-to-icp`, the ICP schema, the catalog as the operable constraint, the validator as the eval rubric). Returns a **draft** (never active). Eval-fail / non-operable proposals → rejected/flagged, not shown.
3. **AC3 — operability** from `field-catalog` (`isOperable(fieldKey)`); non-operable criteria flagged `operable:false` with a warning.
4. **AC4 — exclusion** criteria carried via an `isExclusion` flag in the version snapshot (hard-filter, feeds spec-09).
5. Pure versioning + operability + NL-draft validation unit-tested with a stub `runAgent`; the store is injected. **Schema change → parks pending prod `0087`** (like 00/02/03/04).
